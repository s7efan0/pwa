import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { MatchEvent, MatchStatus, CardEvent } from '@livescore/types';

export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    season: text('season').notNull(),
    badgeUrl: text('badge_url'),
    /**
     * Tracked competitions are backfilled and get standings and statistics.
     * Untracked ones are created on the fly by the live poller so that ANY
     * in-play match can be shown — they have no rounds and no table.
     */
    isTracked: boolean('is_tracked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('competitions_external_season_idx').on(t.externalId, t.season),
    index('competitions_tracked_idx').on(t.isTracked),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name'),
    badgeUrl: text('badge_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('teams_external_idx').on(t.externalId)],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    round: integer('round'),
    kickoff: timestamp('kickoff', { withTimezone: true }).notNull(),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id),
    scoreHome: integer('score_home'),
    scoreAway: integer('score_away'),
    htHome: integer('ht_home'),
    htAway: integer('ht_away'),
    status: text('status').$type<MatchStatus>().notNull().default('scheduled'),
    minute: integer('minute'),
    stoppage: integer('stoppage'),
    /** Synthetic match driven by ReplayService, not by the provider. */
    isReplay: boolean('is_replay').notNull().default(false),
    raw: jsonb('raw'),
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('matches_external_idx').on(t.externalId),
    index('matches_status_idx').on(t.status),
    index('matches_kickoff_idx').on(t.kickoff),
    index('matches_competition_round_idx').on(t.competitionId, t.round),
  ],
);

export const matchEvents = pgTable(
  'match_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id),
    isHome: boolean('is_home').notNull(),
    kind: text('kind').$type<MatchEvent['kind']>().notNull(),
    minute: integer('minute').notNull(),
    stoppage: integer('stoppage'),
    // goal
    scorerName: text('scorer_name'),
    assistName: text('assist_name'),
    isPenalty: boolean('is_penalty'),
    isOwnGoal: boolean('is_own_goal'),
    // card
    card: text('card').$type<CardEvent['card']>(),
    playerName: text('player_name'),
    // substitution
    playerInName: text('player_in_name'),
    playerOutName: text('player_out_name'),
    /** When a push was sent for this event. NULL = not yet notified. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('match_events_external_idx').on(t.externalId),
    index('match_events_match_idx').on(t.matchId),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint)],
);

export const matchSubscriptions = pgTable(
  'match_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('match_subs_unique_idx').on(t.subscriptionId, t.matchId)],
);

export const matchesRelations = relations(matches, ({ one, many }) => ({
  competition: one(competitions, {
    fields: [matches.competitionId],
    references: [competitions.id],
  }),
  homeTeam: one(teams, {
    fields: [matches.homeTeamId],
    references: [teams.id],
  }),
  awayTeam: one(teams, {
    fields: [matches.awayTeamId],
    references: [teams.id],
  }),
  events: many(matchEvents),
}));

export const matchEventsRelations = relations(matchEvents, ({ one }) => ({
  match: one(matches, {
    fields: [matchEvents.matchId],
    references: [matches.id],
  }),
  team: one(teams, { fields: [matchEvents.teamId], references: [teams.id] }),
}));
