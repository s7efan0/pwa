import { Logger } from '@nestjs/common';
import type { MatchEvent, MatchStatus } from '@livescore/types';
import type { TsdbEventDto } from './event.dto';
import type { TsdbTimelineDto } from './timeline.dto';
import type { TsdbLiveScoreDto } from './livescore.dto';
import { parseMinute, toBool, toInstant, toInt, toStr } from './coerce';

const log = new Logger('TsdbMappers');

/** Verified: NS, FT, 2H. The rest follow API-Football's vocabulary,
 *  which TheSportsDB resells — treat them as informed guesses. */
const STATUS_MAP: Record<string, MatchStatus> = {
  NS: 'scheduled',
  '1H': 'live',
  '2H': 'live',
  ET: 'live',
  BT: 'live',
  P: 'live',
  LIVE: 'live',
  HT: 'halftime',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  CANC: 'postponed',
  ABD: 'postponed',
  SUSP: 'postponed',
};

export function mapStatus(raw: unknown, postponed?: unknown): MatchStatus {
  if (toStr(postponed)?.toLowerCase() === 'yes') return 'postponed';
  const key = toStr(raw)?.toUpperCase();
  if (key === null || key === undefined) return 'unknown';
  const mapped = STATUS_MAP[key];
  if (!mapped) log.warn(`Unmapped strStatus: ${key}`);
  return mapped ?? 'unknown';
}

export type MappedMatch = {
  externalId: string;
  competitionExternalId: string | null;
  competitionName: string | null;
  competitionBadge: string | null;
  season: string | null;
  round: number | null;
  kickoff: string | null;
  homeTeamExternalId: string | null;
  awayTeamExternalId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeBadge: string | null;
  awayBadge: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  status: MatchStatus;
  minute: number | null;
  stoppage: number | null;
};

export function mapMatch(dto: TsdbEventDto): MappedMatch {
  const progress = parseMinute(dto.strProgress);
  return {
    externalId: dto.idEvent,
    competitionExternalId: toStr(dto.idLeague),
    competitionName: toStr(dto.strLeague),
    competitionBadge: toStr(dto.strLeagueBadge),
    season: toStr(dto.strSeason),
    round: toInt(dto.intRound),
    kickoff: toInstant(dto.strTimestamp),
    homeTeamExternalId: toStr(dto.idHomeTeam),
    awayTeamExternalId: toStr(dto.idAwayTeam),
    homeTeamName: toStr(dto.strHomeTeam),
    awayTeamName: toStr(dto.strAwayTeam),
    homeBadge: toStr(dto.strHomeTeamBadge),
    awayBadge: toStr(dto.strAwayTeamBadge),
    scoreHome: toInt(dto.intHomeScore),
    scoreAway: toInt(dto.intAwayScore),
    status: mapStatus(dto.strStatus, dto.strPostponed),
    minute: progress?.minute ?? null,
    stoppage: progress?.stoppage ?? null,
  };
}

type EventCtx = { matchId: string; homeTeamId: string; awayTeamId: string };

export function mapTimelineEvent(
  dto: TsdbTimelineDto,
  ctx: EventCtx,
): MatchEvent | null {
  const t = parseMinute(dto.intTime);
  if (!t || !dto.idTimeline) return null;

  const isHome = toBool(dto.strHome);

  const base = {
    id: dto.idTimeline,
    externalId: dto.idTimeline,
    matchId: ctx.matchId,
    teamId: isHome ? ctx.homeTeamId : ctx.awayTeamId,
    isHome,
    minute: t.minute,
    stoppage: t.stoppage,
  };

  const kind = toStr(dto.strTimeline)?.toLowerCase();
  const detail = toStr(dto.strTimelineDetail)?.toLowerCase() ?? '';

  if (kind === 'goal') {
    return {
      ...base,
      kind: 'goal',
      scorerName: toStr(dto.strPlayer),
      assistName: toStr(dto.strAssist),
      isPenalty: detail.includes('penalty'),
      isOwnGoal: detail.includes('own goal'),
    };
  }
  if (kind === 'card') {
    const card = detail.includes('second yellow')
      ? 'second-yellow'
      : detail.includes('red')
        ? 'red'
        : detail.includes('yellow')
          ? 'yellow'
          : null;
    if (!card) {
      log.warn(`Unmapped card detail: ${detail}`);
      return null;
    }
    return { ...base, kind: 'card', card, playerName: toStr(dto.strPlayer) };
  }
  if (kind === 'subst') {
    return {
      ...base,
      kind: 'substitution',
      playerInName: toStr(dto.strPlayer),
      playerOutName: toStr(dto.strAssist),
    };
  }

  log.warn(`Unmapped strTimeline: ${kind}`);
  return null;
}

/**
 * Northern-hemisphere football seasons straddle the new year, so a date alone
 * is ambiguous. livescore.php carries no season field, which we need because
 * competitions are keyed by (externalId, season).
 */
export function seasonFromDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * livescore.php returns a leaner shape than eventsround.php — no round, no
 * season. Enough to create and display a match, not enough for a league table,
 * which is why competitions created this way are left untracked.
 */
export function mapLiveScore(dto: TsdbLiveScoreDto): MappedMatch {
  const progress = parseMinute(dto.strProgress);
  const kickoff = toInstant(dto.strTimestamp) ?? toInstant(dto.dateEvent);
  return {
    externalId: dto.idEvent ?? dto.idLiveScore,
    competitionExternalId: toStr(dto.idLeague),
    competitionName: toStr(dto.strLeague),
    // livescore.php carries no league badge; backfill supplies it.
    competitionBadge: null,
    season: seasonFromDate(kickoff),
    round: null,
    kickoff,
    homeTeamExternalId: toStr(dto.idHomeTeam),
    awayTeamExternalId: toStr(dto.idAwayTeam),
    homeTeamName: toStr(dto.strHomeTeam),
    awayTeamName: toStr(dto.strAwayTeam),
    homeBadge: toStr(dto.strHomeTeamBadge),
    awayBadge: toStr(dto.strAwayTeamBadge),
    scoreHome: toInt(dto.intHomeScore),
    scoreAway: toInt(dto.intAwayScore),
    status: mapStatus(dto.strStatus),
    minute: progress?.minute ?? null,
    stoppage: progress?.stoppage ?? null,
  };
}
