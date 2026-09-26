import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TsdbEventsResponse } from './event.dto';
import type { TsdbTimelineResponse } from './timeline.dto';
import type { TsdbLiveScoreResponse } from './livescore.dto';
import type { TsdbTeamsResponse } from './team.dto';

/** Documented free-tier ceiling. */
const RATE_LIMIT_PER_MIN = 30;

@Injectable()
export class TheSportsDbClient {
  private readonly logger = new Logger(TheSportsDbClient.name);
  private chain: Promise<unknown> = Promise.resolve();
  private lastAt = 0;
  /** Free tier allows 30/min. 2100ms ≈ 28/min, leaving headroom. */
  private readonly minGapMs = 2100;

  constructor(private readonly config: ConfigService) {}

  private get base(): string {
    const key = this.config.get<string>('THESPORTSDB_KEY') ?? '123';
    return `https://www.thesportsdb.com/api/v1/json/${key}`;
  }

  /** Serialises every request and spaces them out, so the whole app
   *  shares one rate-limit budget no matter how many callers there are. */
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
      return fn();
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Timestamps of the last minute of requests, so the log can state actual
   * consumption rather than a guess. The throttle guarantees we stay under
   * the limit; this shows how much of the budget is left for anything else.
   */
  private readonly recent: number[] = [];

  private countRequest(path: string): void {
    const now = Date.now();
    this.recent.push(now);
    while (this.recent.length > 0 && now - this.recent[0] > 60_000) {
      this.recent.shift();
    }
    // Endpoint, not full path — ids would make every line unique and useless
    // for spotting which call is eating the budget.
    const endpoint = path.slice(1).split('?')[0];
    this.logger.debug(
      `${endpoint} — ${this.recent.length}/${RATE_LIMIT_PER_MIN} used in the last 60s`,
    );
  }

  private request<T>(path: string): Promise<T> {
    return this.schedule(async () => {
      this.countRequest(path);
      const url = `${this.base}${path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TheSportsDB ${res.status} for ${path}`);
      return (await res.json()) as T;
    });
  }

  getRound(leagueId: string, round: number, season: string) {
    return this.request<TsdbEventsResponse>(
      `/eventsround.php?id=${leagueId}&r=${round}&s=${season}`,
    );
  }

  /** One call returns every in-play match globally — filter to our leagues. */
  getLiveScores() {
    return this.request<TsdbLiveScoreResponse>(`/livescore.php?s=Soccer`);
  }

  /** Single match by provider id — used to finalise matches that have ended. */
  getEvent(eventId: string) {
    return this.request<TsdbEventsResponse>(`/lookupevent.php?id=${eventId}`);
  }

  getTimeline(eventId: string) {
    return this.request<TsdbTimelineResponse>(
      `/lookuptimeline.php?id=${eventId}`,
    );
  }

  getTeams(leagueId: string) {
    return this.request<TsdbTeamsResponse>(
      `/lookup_all_teams.php?id=${leagueId}`,
    );
  }
}
