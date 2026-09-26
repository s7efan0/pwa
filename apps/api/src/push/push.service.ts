import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { type MatchEvent, formatEvent } from '@livescore/types';
import { DRIZZLE, type Database } from '../db/db.module';
import {
  matchEvents,
  matchSubscriptions,
  pushSubscriptions,
} from '../db/schema';
import { ApiService } from '../api/api.service';

export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly api: ApiService,
  ) {}

  onModuleInit() {
    webpush.setVapidDetails(
      this.config.getOrThrow<string>('VAPID_SUBJECT'),
      this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  get publicKey(): string {
    return this.config.getOrThrow<string>('VAPID_PUBLIC_KEY');
  }

  /** Upsert on endpoint: the browser may re-issue the same one. */
  async saveSubscription(sub: BrowserSubscription): Promise<string> {
    const [row] = await this.db
      .insert(pushSubscriptions)
      .values({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      })
      .returning({ id: pushSubscriptions.id });
    return row.id;
  }

  async followMatch(endpoint: string, matchId: string) {
    const [sub] = await this.db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (!sub) {
      throw new NotFoundException(
        'Unknown subscription — call /subscribe first',
      );
    }

    await this.db
      .insert(matchSubscriptions)
      .values({ subscriptionId: sub.id, matchId })
      .onConflictDoNothing();
    return { following: true };
  }

  /**
   * Follow several matches at once.
   *
   * Following every live match one row at a time meant a round trip per
   * match; with 40 in play that is 40 requests to press one button. A single
   * multi-row insert also makes it atomic — you are either following all of
   * them or none.
   */
  async followMatches(endpoint: string, matchIds: string[]) {
    if (matchIds.length === 0) return { following: 0 };

    const [sub] = await this.db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (!sub) {
      throw new NotFoundException(
        'Unknown subscription — call /subscribe first',
      );
    }

    // Duplicates in the payload would violate the unique index within a
    // single statement, which onConflictDoNothing cannot rescue.
    const unique = [...new Set(matchIds)];

    await this.db
      .insert(matchSubscriptions)
      .values(unique.map((matchId) => ({ subscriptionId: sub.id, matchId })))
      .onConflictDoNothing();

    return { following: unique.length };
  }

  /** Unfollow several matches at once. */
  async unfollowMatches(endpoint: string, matchIds: string[]) {
    if (matchIds.length === 0) return { unfollowed: 0 };

    const [sub] = await this.db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (!sub) return { unfollowed: 0 };

    const removed = await this.db
      .delete(matchSubscriptions)
      .where(
        and(
          eq(matchSubscriptions.subscriptionId, sub.id),
          inArray(matchSubscriptions.matchId, [...new Set(matchIds)]),
        ),
      )
      .returning({ id: matchSubscriptions.id });

    return { unfollowed: removed.length };
  }

  /** Which matches a given browser subscription is following. */
  async followedMatchIds(endpoint: string): Promise<string[]> {
    const rows = await this.db
      .select({ matchId: matchSubscriptions.matchId })
      .from(matchSubscriptions)
      .innerJoin(
        pushSubscriptions,
        eq(pushSubscriptions.id, matchSubscriptions.subscriptionId),
      )
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return rows.map((r) => r.matchId);
  }

  /**
   * Handle `pushsubscriptionchange`: the push service reissued the browser a
   * new endpoint. Update the existing row IN PLACE so match_subscriptions —
   * i.e. everything the user chose to follow — survives the rotation.
   */
  async rotateSubscription(
    oldEndpoint: string | null,
    sub: BrowserSubscription,
  ) {
    if (oldEndpoint) {
      const [row] = await this.db
        .update(pushSubscriptions)
        .set({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        })
        .where(eq(pushSubscriptions.endpoint, oldEndpoint))
        .returning({ id: pushSubscriptions.id });

      if (row) {
        this.logger.log('Rotated a push subscription, follows preserved');
        return { rotated: true };
      }
    }

    // No prior row to migrate — store the new one so push works again, even
    // though the user's follows are lost.
    await this.saveSubscription(sub);
    this.logger.warn('Rotation had no prior subscription; created a new one');
    return { rotated: false, created: true };
  }

  async unfollowMatch(endpoint: string, matchId: string) {
    const [sub] = await this.db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (sub) {
      await this.db
        .delete(matchSubscriptions)
        .where(
          and(
            eq(matchSubscriptions.subscriptionId, sub.id),
            eq(matchSubscriptions.matchId, matchId),
          ),
        );
    }
    return { following: false };
  }

  /** Same producer as SSE — live poller and replay both land here. */
  @OnEvent('match.events')
  async onMatchEvents(p: { matchId: string; events: MatchEvent[] }) {
    try {
      await this.notify(p.matchId, p.events);
    } catch (err) {
      // An unhandled rejection here would take the process down.
      this.logger.error(`Push failed for ${p.matchId}: ${String(err)}`);
    }
  }

  private async notify(matchId: string, events: MatchEvent[]) {
    if (events.length === 0) return;

    const subs = await this.db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(matchSubscriptions)
      .innerJoin(
        pushSubscriptions,
        eq(pushSubscriptions.id, matchSubscriptions.subscriptionId),
      )
      .where(eq(matchSubscriptions.matchId, matchId));

    if (subs.length === 0) return;

    const match = await this.api.getMatch(matchId);
    if (!match) return;
    const score = match.score
      ? `${match.score.home}-${match.score.away}`
      : 'vs';
    const title = `${match.homeTeam.name} ${score} ${match.awayTeam.name}`;

    let delivered = 0;
    let failed = 0;

    for (const e of events) {
      // Payloads are size-limited (~4KB) — send ids, not objects.
      const payload = JSON.stringify({
        title,
        body: formatEvent(e),
        matchId,
      });
      const results = await Promise.all(subs.map((s) => this.send(s, payload)));
      delivered += results.filter(Boolean).length;
      failed += results.filter((ok) => !ok).length;
    }

    await this.db
      .update(matchEvents)
      .set({ notifiedAt: new Date() })
      .where(
        inArray(
          matchEvents.externalId,
          events.map((e) => e.externalId),
        ),
      );

    // Count actual deliveries, not attempts — otherwise a completely broken
    // push setup still logs a cheerful success line.
    this.logger.log(
      `${events.length} event(s): ${delivered} delivered, ${failed} failed ` +
        `across ${subs.length} subscriber(s)`,
    );
  }

  /** Returns true only on an accepted delivery. */
  private async send(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<boolean> {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the browser threw the subscription away — uninstalled,
      // permission revoked, or profile cleared. Without pruning these, dead
      // endpoints accumulate forever and every send wastes a request.
      if (status === 404 || status === 410) {
        await this.db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, sub.endpoint));
        this.logger.log('Pruned an expired subscription');
      } else {
        this.logger.warn(`Push send failed (${status ?? '?'})`);
      }
      return false;
    }
  }
}
