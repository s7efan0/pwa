import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestService } from './ingest.service';
import { AdminGuard } from './admin.guard';

/**
 * Operational backfill. The poller only ever UPDATES matches it already knows,
 * so a competition must be imported here before its live scores will appear.
 *
 * Guarded by a shared secret: every call spends the upstream 30/min budget,
 * and the server binds to 0.0.0.0 so the phone can reach it — which means the
 * whole LAN can too. Send `x-admin-token: $ADMIN_TOKEN`.
 *
 * Round numbers are competition-specific: leagues run 1..34, but cups do not.
 * UEFA Women's CL 2026-2027 qualifiers are round 0; the Polish Cup uses 128.
 */
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly config: ConfigService,
    private readonly ingest: IngestService,
  ) {}

  @Post('import/:from/:to')
  async importRange(@Param('from') from: string, @Param('to') to: string) {
    const season = this.config.getOrThrow<string>('TSDB_SEASON');
    const out: {
      league: string;
      round: number;
      total: number;
      imported: number;
    }[] = [];
    // Backfill every tracked competition, not just one — they are what the
    // standings and statistics pages are built from.
    for (const league of this.ingest.trackedLeagueIds) {
      for (let r = Number(from); r <= Number(to); r++) {
        out.push({
          league,
          ...(await this.ingest.importRound(league, r, season)),
        });
      }
    }
    return out;
  }

  @Post('sync-timeline/:externalId')
  async syncTimeline(@Param('externalId') externalId: string) {
    const fresh = await this.ingest.syncTimelineByExternalId(externalId);
    return { newEvents: fresh.length };
  }
}
