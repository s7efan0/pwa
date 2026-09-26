import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/db.module';
import { matchEvents, matches } from '../db/schema';
import { ReplayService } from './replay.service';

@Controller('replay')
export class ReplayController {
  constructor(
    private readonly replay: ReplayService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Finished, non-replay matches that actually have events to replay. */
  @Get('candidates')
  async candidates() {
    return this.db
      .select({
        matchId: matches.id,
        eventCount: sql<number>`count(${matchEvents.id})::int`,
      })
      .from(matches)
      .innerJoin(matchEvents, eq(matchEvents.matchId, matches.id))
      .where(and(eq(matches.status, 'finished'), eq(matches.isReplay, false)))
      .groupBy(matches.id);
  }

  @Get()
  list() {
    return this.replay.list();
  }

  @Post('start/:matchId')
  start(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query('speed') speed?: string,
  ) {
    return this.replay.start(matchId, speed ? Number(speed) : 60);
  }

  @Post('stop/:replayMatchId')
  stop(@Param('replayMatchId', ParseUUIDPipe) id: string) {
    return this.replay.stop(id);
  }
}
