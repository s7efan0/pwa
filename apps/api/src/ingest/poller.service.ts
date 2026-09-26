import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestService } from './ingest.service';

@Injectable()
export class PollerService {
  private readonly logger = new Logger(PollerService.name);
  private running = false;

  constructor(private readonly ingest: IngestService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollLive(): Promise<void> {
    // Rate limiting queues requests, so a poll can outlast its 30s window.
    // Without this guard the next tick would pile on behind it.
    if (this.running) {
      this.logger.warn('Previous poll still running — skipping this tick');
      return;
    }
    this.running = true;
    try {
      const r = await this.ingest.syncLive(this.ingest.trackedLeagueIds);
      const msg =
        `live: ${r.liveTotal} in play, ${r.created} new, ${r.updated} updated, ` +
        `${r.newEvents} events (${r.namedFromTimeline} named, ` +
        `${r.derivedAnonymous} derived), ${r.finalized} finalised`;
      // Only worth an info line when something actually happened; otherwise
      // debug, so the poller is observable without flooding the log.
      if (r.created > 0 || r.newEvents > 0 || r.finalized > 0) {
        this.logger.log(msg);
      } else {
        this.logger.debug(msg);
      }
    } catch (err) {
      this.logger.error(`Poll failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
