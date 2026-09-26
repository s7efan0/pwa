import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Observable,
  Subject,
  defer,
  filter,
  from,
  interval,
  map,
  merge,
} from 'rxjs';
import type {
  MatchDetail,
  MatchEvent,
  MatchStatus,
  Score,
  StreamMessage,
} from '@livescore/types';
import { ApiService } from './api.service';

@Injectable()
export class MatchStreamService {
  /** One hot stream for the whole app; each subscriber filters to its match. */
  private readonly bus = new Subject<StreamMessage>();

  constructor(private readonly api: ApiService) {}

  @OnEvent('match.events')
  onEvents(p: { matchId: string; events: MatchEvent[] }) {
    this.bus.next({ type: 'events', matchId: p.matchId, events: p.events });
  }

  @OnEvent('match.updated')
  onUpdated(p: {
    matchId: string;
    score: Score | null;
    status: MatchStatus;
    minute: number | null;
    stoppage: number | null;
  }) {
    this.bus.next({ type: 'update', ...p });
  }

  forMatch(matchId: string): Observable<StreamMessage> {
    // defer() so the fetch happens per subscriber, at subscribe time.
    const snapshot$ = defer(() => from(this.api.getMatch(matchId))).pipe(
      filter((m): m is MatchDetail => m !== null),
      map((match): StreamMessage => ({ type: 'snapshot', match })),
    );

    const live$ = this.bus.pipe(
      filter(
        (m) =>
          (m.type === 'events' || m.type === 'update') && m.matchId === matchId,
      ),
    );

    const ping$ = interval(25_000).pipe(
      map((): StreamMessage => ({ type: 'ping' })),
    );

    return merge(snapshot$, live$, ping$);
  }
}
