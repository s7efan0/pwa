import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiService } from './api.service';

import { Sse, type MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { MatchStreamService } from './match-stream.service';

@Controller()
export class ApiController {
  constructor(
    private readonly api: ApiService,
    private readonly streams: MatchStreamService,
  ) {}

  @Get('competitions')
  @Header('Cache-Control', 'public, max-age=3600')
  listCompetitions() {
    return this.api.listCompetitions();
  }

  @Get('competitions/:id/rounds/:round')
  @Header('Cache-Control', 'public, max-age=60')
  matchesByRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('round', ParseIntPipe) round: number,
  ) {
    return this.api.getMatchesByRound(id, round);
  }

  @Get('competitions/:id/standings')
  @Header('Cache-Control', 'public, max-age=300')
  standings(@Param('id', ParseUUIDPipe) id: string) {
    return this.api.getStandings(id);
  }

  // Must never be cached — this is the whole point of the app.
  @Get('matches/live')
  @Header('Cache-Control', 'no-store')
  live() {
    return this.api.getLiveMatches();
  }

  @Get('matches/:id')
  @Header('Cache-Control', 'public, max-age=30')
  async match(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.api.getMatch(id);
    if (!m) throw new NotFoundException(`Match ${id} not found`);
    return m;
  }

  @Sse('matches/:id/stream')
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.streams.forMatch(id).pipe(
      map((payload): MessageEvent => ({
        data: payload,
      })),
    );
  }

  @Get('competitions/:id/stats')
  @Header('Cache-Control', 'public, max-age=300')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.api.getStats(id);
  }
}
