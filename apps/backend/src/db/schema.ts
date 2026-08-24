import {
  pgTable,
  text,
  timestamp,
  bigserial,
  bigint,
  type AnyPgColumn,
  jsonb,
  primaryKey,
  pgSchema,
  boolean,
  doublePrecision,
  integer,
  smallint,
  index,
  uniqueIndex,
  unique,
  check,
  foreignKey,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { account, session, user, userRole } from './auth-schema.js'

// --- Application Tables ---

export const tagGroups = pgTable('tag_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  localized_name: jsonb('localized_name').$type<Record<string, string>>().notNull(),
  color: text('color').notNull(),
})

export const tags = pgTable('tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  localized_name: jsonb('localized_name').$type<Record<string, string>>().notNull(),
  localized_description: jsonb('localized_description').$type<Record<string, string>>().notNull(),
  group_id: bigint('group_id', { mode: 'number' }).references(() => tagGroups.id),
})

export const tagSongs = pgTable('tag_songs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  tag_id: bigint('tag_id', { mode: 'number' })
    .references(() => tags.id)
    .notNull(),
  song_id: text('song_id').notNull(),
  sheet_type: text('sheet_type').notNull(),
  sheet_difficulty: text('sheet_difficulty').notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const profiles = pgTable('profiles', {
  id: text('id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  display_name: text('display_name').notNull(),
})

export const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  song_id: text('song_id').notNull(),
  sheet_type: text('sheet_type').notNull(),
  sheet_difficulty: text('sheet_difficulty').notNull(),
  parent_id: bigint('parent_id', { mode: 'number' }).references((): AnyPgColumn => comments.id),
  content: text('content').notNull(),
})

// --- Administrator Role History ---

export const adminRoleChangeHistory = pgTable(
  'admin_role_change_history',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    subject_user_id: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    actor_user_id: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    previous_role: userRole('previous_role').notNull(),
    new_role: userRole('new_role').notNull(),
    reason: text('reason').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'admin_role_change_history_transition_check',
      sql`(${table.previous_role} = 'user' and ${table.new_role} = 'admin')
        or (${table.previous_role} = 'admin' and ${table.new_role} = 'user')`,
    ),
    check(
      'admin_role_change_history_reason_check',
      sql`length(${table.reason}) between 1 and 1000
        and ${table.reason} !~ '^[[:space:]]'
        and ${table.reason} !~ '[[:space:]]$'`,
    ),
    index('admin_role_change_history_subject_created_idx').on(
      table.subject_user_id,
      table.created_at.desc(),
      table.id.desc(),
    ),
  ],
)

// --- Administrator User-Ban State and History ---

export const adminUserBanHistory = pgTable(
  'admin_user_ban_history',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    subject_user_id: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    actor_user_id: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    previous_event_id: bigint('previous_event_id', { mode: 'bigint' })
      .unique()
      .references((): AnyPgColumn => adminUserBanHistory.id, { onDelete: 'restrict' }),
    action: text('action').$type<'ban' | 'unban'>().notNull(),
    reason: text('reason'),
    ban_started_at: timestamp('ban_started_at', { withTimezone: true, precision: 3 }),
    expires_at: timestamp('expires_at', { withTimezone: true, precision: 3 }),
    request_correlation_id: uuid('request_correlation_id'),
    created_at: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  },
  (table) => [
    check('admin_user_ban_history_action_check', sql`${table.action} in ('ban', 'unban')`),
    check(
      'admin_user_ban_history_reason_check',
      sql`(${table.action} = 'ban'
          and ${table.reason} is not null
          and length(${table.reason}) between 1 and 1000
          and ${table.reason} !~ '^[[:space:]]'
          and ${table.reason} !~ '[[:space:]]$')
        or (${table.action} = 'unban'
          and (${table.reason} is null
            or (length(${table.reason}) between 1 and 1000
              and ${table.reason} !~ '^[[:space:]]'
              and ${table.reason} !~ '[[:space:]]$')))`,
    ),
    check(
      'admin_user_ban_history_expiry_check',
      sql`(${table.action} = 'ban'
          and ${table.ban_started_at} is not null
          and ${table.ban_started_at} <= ${table.created_at}
          and (${table.expires_at} is null or ${table.expires_at} > ${table.created_at}))
        or (${table.action} = 'unban'
          and ${table.ban_started_at} is null
          and ${table.expires_at} is null)`,
    ),
    unique('admin_user_ban_history_event_identity_unique').on(
      table.id,
      table.subject_user_id,
      table.actor_user_id,
      table.action,
    ),
    index('admin_user_ban_history_subject_created_idx').on(
      table.subject_user_id,
      table.created_at.desc(),
      table.id.desc(),
    ),
    uniqueIndex('admin_user_ban_history_subject_root_unique')
      .on(table.subject_user_id)
      .where(sql`${table.previous_event_id} is null`),
  ],
)

export const adminUserBanState = pgTable(
  'admin_user_ban_state',
  {
    subject_user_id: text('subject_user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'restrict' }),
    established_action: text('established_action').$type<'ban' | 'unban'>().notNull(),
    ban_started_at: timestamp('ban_started_at', { withTimezone: true, precision: 3 }),
    ban_expires_at: timestamp('ban_expires_at', { withTimezone: true, precision: 3 }),
    ban_reason: text('ban_reason'),
    actor_user_id: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    established_by_event_id: bigint('established_by_event_id', { mode: 'bigint' }).notNull().unique(),
  },
  (table) => [
    check('admin_user_ban_state_action_check', sql`${table.established_action} in ('ban', 'unban')`),
    check(
      'admin_user_ban_state_projection_check',
      sql`(${table.established_action} = 'ban'
          and ${table.ban_started_at} is not null
          and ${table.ban_reason} is not null
          and length(${table.ban_reason}) between 1 and 1000
          and ${table.ban_reason} !~ '^[[:space:]]'
          and ${table.ban_reason} !~ '[[:space:]]$'
          and (${table.ban_expires_at} is null or ${table.ban_expires_at} > ${table.ban_started_at}))
        or (${table.established_action} = 'unban'
          and ${table.ban_started_at} is null
          and ${table.ban_expires_at} is null
          and ${table.ban_reason} is null)`,
    ),
    foreignKey({
      name: 'admin_user_ban_state_establishing_event_fk',
      columns: [table.established_by_event_id, table.subject_user_id, table.actor_user_id, table.established_action],
      foreignColumns: [
        adminUserBanHistory.id,
        adminUserBanHistory.subject_user_id,
        adminUserBanHistory.actor_user_id,
        adminUserBanHistory.action,
      ],
    }).onDelete('restrict'),
  ],
)

// --- Administrator Primary Authentication ---

export const adminPrimaryAuthWindows = pgTable(
  'admin_primary_auth_windows',
  {
    session_id: text('session_id')
      .primaryKey()
      .references(() => session.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    completed_at: timestamp('completed_at', { withTimezone: true }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('admin_primary_auth_windows_method_check', sql`${table.method} in ('password', 'google')`),
    check(
      'admin_primary_auth_windows_expiry_check',
      sql`${table.expires_at} = ${table.completed_at} + interval '10 minutes'`,
    ),
    index('admin_primary_auth_windows_user_idx').on(table.user_id),
    index('admin_primary_auth_windows_expiry_idx').on(table.expires_at),
  ],
)

export const adminPrimaryAuthOauthAttempts = pgTable(
  'admin_primary_auth_oauth_attempts',
  {
    state_digest: text('state_digest').primaryKey(),
    session_id: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    account_id: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    provider_account_id: text('provider_account_id').notNull(),
    code_verifier: text('code_verifier').notNull(),
    nonce: text('nonce').notNull(),
    redirect_uri: text('redirect_uri').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('admin_primary_auth_oauth_attempts_digest_check', sql`${table.state_digest} ~ '^[a-f0-9]{64}$'`),
    check('admin_primary_auth_oauth_attempts_provider_check', sql`${table.provider} = 'google'`),
    check(
      'admin_primary_auth_oauth_attempts_verifier_check',
      sql`length(${table.code_verifier}) between 43 and 128 and ${table.code_verifier} ~ '^[A-Za-z0-9._~-]+$'`,
    ),
    check(
      'admin_primary_auth_oauth_attempts_expiry_check',
      sql`${table.expires_at} = ${table.created_at} + interval '10 minutes'`,
    ),
    uniqueIndex('admin_primary_auth_oauth_attempts_session_idx').on(table.session_id),
    index('admin_primary_auth_oauth_attempts_expiry_idx').on(table.expires_at),
  ],
)

export const adminPrimaryAuthPasswordRateLimits = pgTable(
  'admin_primary_auth_password_rate_limits',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    window_started_at: timestamp('window_started_at', { withTimezone: true }).notNull(),
    failure_count: integer('failure_count').notNull(),
    blocked_until: timestamp('blocked_until', { withTimezone: true }),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('admin_primary_auth_password_rate_limits_count_check', sql`${table.failure_count} between 1 and 5`),
  ],
)

export const songAliases = pgTable('song_aliases', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  song_id: text('song_id').notNull(),
  name: text('name').notNull(),
  created_by: text('created_by').references(() => user.id, { onDelete: 'set null' }),
})

// --- LXNS OAuth Tables ---

export const lxnsOauthStates = pgTable('lxns_oauth_states', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  state: text('state').notNull().unique(),
  user_id: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const lxnsOauthTokens = pgTable('lxns_oauth_tokens', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  access_token: text('access_token').notNull(),
  refresh_token: text('refresh_token').notNull(),
  expires_at: timestamp('expires_at').notNull(),
  scope: text('scope').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// --- Arcade Location Tables ---
//
// The crawler owns writes to this schema. These definitions let the API query
// the normalized current projection and keep Drizzle migrations in sync with
// the crawler's PostgreSQL contract.
// Deployment order: apply the backend migration before the crawler's first
// ensure_schema call because generated CREATE SCHEMA migrations are one-shot.

export const arcade = pgSchema('arcade')

export const arcadeChains = arcade.table(
  'chains',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    country_codes: text('country_codes').array().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('chains_country_codes_nonempty_check', sql`cardinality(${table.country_codes}) > 0`)],
)

export const arcadeGames = arcade.table(
  'games',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    manufacturer: text('manufacturer').notNull(),
    active: boolean('active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('arcade_games_active_name_idx').on(table.active, table.name)],
)

export const arcadeGameSourceMappings = arcade.table(
  'game_source_mappings',
  {
    source: text('source').notNull(),
    source_game_id: text('source_game_id').notNull(),
    game_id: text('game_id')
      .notNull()
      .references(() => arcadeGames.id),
    external_name: text('external_name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    active: boolean('active').default(true).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.source, table.source_game_id],
    }),
    index('game_source_mappings_game_id_idx').on(table.game_id),
  ],
)

export const arcadeCrawlRuns = arcade.table(
  'crawl_runs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    source: text('source').notNull(),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull(),
    is_complete: boolean('is_complete').default(false).notNull(),
    record_count: integer('record_count').default(0).notNull(),
    error: text('error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    check('arcade_crawl_runs_status_check', sql`${table.status} in ('running', 'succeeded', 'failed')`),
    check('arcade_crawl_runs_record_count_check', sql`${table.record_count} >= 0`),
    index('crawl_runs_source_started_idx').on(table.source, table.started_at.desc()),
  ],
)

export const arcadeVenues = arcade.table(
  'venues',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    public_id: text('public_id').notNull(),
    name: text('name').notNull(),
    normalized_name: text('normalized_name').notNull(),
    chain_id: text('chain_id').references(() => arcadeChains.id),
    country_code: text('country_code'),
    region: text('region'),
    city: text('city'),
    address: text('address'),
    normalized_address: text('normalized_address'),
    postal_code: text('postal_code'),
    phone: text('phone'),
    website_url: text('website_url'),
    timezone: text('timezone'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('venues_public_id_unique').on(table.public_id),
    check('venues_public_id_check', sql`${table.public_id} ~ '^dven_[23456789abcdefghjkmnpqrstvwxyz]{10}$'`),
    check('venues_coordinates_paired_check', sql`(${table.latitude} is null) = (${table.longitude} is null)`),
    check('venues_latitude_range_check', sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
    check('venues_longitude_range_check', sql`${table.longitude} is null or ${table.longitude} between -180 and 180`),
    check(
      'venues_coordinates_nonzero_check',
      sql`${table.latitude} is null or ${table.latitude} <> 0 or ${table.longitude} <> 0`,
    ),
    index('venues_normalized_name_idx').on(table.normalized_name),
    index('venues_chain_id_idx').on(table.chain_id),
    index('venues_location_idx').on(table.country_code, table.region, table.city),
    index('venues_coordinates_idx').on(table.latitude, table.longitude),
    index('venues_name_address_idx').on(table.normalized_name, table.normalized_address),
  ],
)

export const arcadeInstallationIdentities = arcade.table(
  'installation_identities',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    public_id: text('public_id').notNull(),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id, { onDelete: 'cascade' }),
    game_id: text('game_id')
      .notNull()
      .references(() => arcadeGames.id),
    version: text('version'),
    cabinet_model: text('cabinet_model'),
    region: text('region'),
    network: text('network'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('installation_identities_public_id_unique').on(table.public_id),
    unique('installation_identities_logical_identity_unique')
      .on(table.venue_id, table.game_id, table.region, table.network, table.version, table.cabinet_model)
      .nullsNotDistinct(),
    check(
      'installation_identities_public_id_check',
      sql`${table.public_id} ~ '^dins_[23456789abcdefghjkmnpqrstvwxyz]{10}$'`,
    ),
    index('installation_identities_venue_idx').on(table.venue_id),
    index('installation_identities_game_idx').on(table.game_id),
  ],
)

export const arcadeVenueChainDecisions = arcade.table(
  'venue_chain_decisions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id),
    classifier_version: text('classifier_version').notNull(),
    input_hash: text('input_hash').notNull(),
    decision: text('decision').notNull(),
    chain_id: text('chain_id').references(() => arcadeChains.id),
    previous_chain_id: text('previous_chain_id').references(() => arcadeChains.id),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    decided_at: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('venue_chain_decisions_input_hash_check', sql`length(${table.input_hash}) = 64`),
    check('venue_chain_decisions_decision_check', sql`${table.decision} in ('matched', 'unmatched', 'ambiguous')`),
    check(
      'venue_chain_decisions_chain_coherence_check',
      sql`(${table.decision} = 'matched') = (${table.chain_id} is not null)`,
    ),
    index('venue_chain_decisions_venue_idx').on(table.venue_id, table.decided_at.desc()),
  ],
)

export const arcadeVenueSources = arcade.table(
  'venue_sources',
  {
    source: text('source').notNull(),
    source_venue_id: text('source_venue_id').notNull(),
    venue_id: bigint('venue_id', { mode: 'bigint' }).references(() => arcadeVenues.id),
    name: text('name').notNull(),
    normalized_name: text('normalized_name').notNull(),
    address: text('address'),
    normalized_address: text('normalized_address'),
    country_code: text('country_code'),
    region: text('region'),
    city: text('city'),
    postal_code: text('postal_code'),
    phone: text('phone'),
    website_url: text('website_url'),
    timezone: text('timezone'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    source_url: text('source_url'),
    payload_hash: text('payload_hash'),
    first_seen_run_id: bigint('first_seen_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeCrawlRuns.id),
    last_seen_run_id: bigint('last_seen_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeCrawlRuns.id),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    active: boolean('active').default(true).notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.source, table.source_venue_id],
    }),
    check('venue_sources_coordinates_paired_check', sql`(${table.latitude} is null) = (${table.longitude} is null)`),
    check('venue_sources_latitude_range_check', sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
    check(
      'venue_sources_longitude_range_check',
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      'venue_sources_coordinates_nonzero_check',
      sql`${table.latitude} is null or ${table.latitude} <> 0 or ${table.longitude} <> 0`,
    ),
    index('venue_sources_venue_id_idx').on(table.venue_id),
    index('venue_sources_normalized_name_idx').on(table.normalized_name),
    index('venue_sources_active_seen_idx').on(table.active, table.last_seen_run_id),
  ],
)

export const arcadeVenueMatches = arcade.table(
  'venue_matches',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    source: text('source').notNull(),
    source_venue_id: text('source_venue_id').notNull(),
    venue_id: bigint('venue_id', { mode: 'bigint' }).references(() => arcadeVenues.id),
    decision: text('decision').notNull(),
    score: doublePrecision('score'),
    reason: jsonb('reason').$type<Record<string, unknown>>().default({}).notNull(),
    decided_by: text('decided_by').notNull(),
    crawl_run_id: bigint('crawl_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeCrawlRuns.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'arcade_venue_matches_decision_check',
      sql`${table.decision} in ('exact_source_id', 'curated', 'auto', 'ambiguous', 'unmatched')`,
    ),
    check('arcade_venue_matches_score_check', sql`${table.score} is null or ${table.score} between 0 and 1`),
    index('venue_matches_source_idx').on(table.source, table.source_venue_id, table.created_at.desc()),
    index('venue_matches_venue_id_idx').on(table.venue_id),
  ],
)

export const arcadeInstallationObservations = arcade.table(
  'installation_observations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    crawl_run_id: bigint('crawl_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeCrawlRuns.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    source_venue_id: text('source_venue_id').notNull(),
    game_id: text('game_id')
      .notNull()
      .references(() => arcadeGames.id),
    observed_at: timestamp('observed_at', { withTimezone: true }).notNull(),
    machine_count: integer('machine_count'),
    version: text('version'),
    cabinet_model: text('cabinet_model'),
    status: text('status'),
    region: text('region'),
    network: text('network'),
    price: text('price'),
    condition: text('condition'),
    confidence: doublePrecision('confidence'),
    source_url: text('source_url'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('arcade_installation_observations_identity_unique')
      .on(
        table.crawl_run_id,
        table.source,
        table.source_venue_id,
        table.game_id,
        table.region,
        table.network,
        table.version,
        table.cabinet_model,
      )
      .nullsNotDistinct(),
    check(
      'arcade_installation_observations_count_check',
      sql`${table.machine_count} is null or ${table.machine_count} >= 0`,
    ),
    check(
      'arcade_installation_observations_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
    index('installation_observations_game_idx').on(table.game_id),
    index('installation_observations_source_venue_idx').on(table.source, table.source_venue_id),
    index('installation_observations_observed_idx').on(table.observed_at.desc()),
  ],
)

export const arcadeInstallations = arcade.table(
  'installations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    installation_identity_id: bigint('installation_identity_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeInstallationIdentities.id, { onDelete: 'cascade' }),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id, { onDelete: 'cascade' }),
    game_id: text('game_id')
      .notNull()
      .references(() => arcadeGames.id),
    version: text('version'),
    cabinet_model: text('cabinet_model'),
    machine_count: integer('machine_count'),
    status: text('status'),
    region: text('region'),
    network: text('network'),
    price: text('price'),
    condition: text('condition'),
    confidence: doublePrecision('confidence'),
    observed_at: timestamp('observed_at', { withTimezone: true }).notNull(),
    last_crawl_run_id: bigint('last_crawl_run_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeCrawlRuns.id),
    source: text('source').notNull(),
    source_url: text('source_url'),
    provenance: jsonb('provenance').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    absent_since: timestamp('absent_since', { withTimezone: true }),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('arcade_installations_identity_unique')
      .on(table.venue_id, table.game_id, table.source, table.region, table.network, table.version, table.cabinet_model)
      .nullsNotDistinct(),
    check('arcade_installations_count_check', sql`${table.machine_count} is null or ${table.machine_count} >= 0`),
    check(
      'arcade_installations_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`,
    ),
    index('installations_game_idx').on(table.game_id),
    index('installations_identity_idx').on(table.installation_identity_id),
    index('installations_venue_active_idx').on(table.venue_id, table.absent_since),
    index('installations_game_active_idx').on(table.game_id, table.absent_since),
  ],
)

export const arcadeGeocodingObservations = arcade.table(
  'geocoding_observations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id),
    provider: text('provider').notNull(),
    operation: text('operation').notNull(),
    observed_at: timestamp('observed_at', { withTimezone: true }).notNull(),
    request_address: text('request_address').notNull(),
    request_city: text('request_city'),
    request_hash: text('request_hash').notNull(),
    attempt: smallint('attempt').notNull(),
    status: text('status').notNull(),
    infocode: text('infocode'),
    level: text('level'),
    rejection_reason: text('rejection_reason'),
    gcj02_longitude: doublePrecision('gcj02_longitude'),
    gcj02_latitude: doublePrecision('gcj02_latitude'),
    reported_crs: text('reported_crs').notNull(),
    wgs84_longitude: doublePrecision('wgs84_longitude'),
    wgs84_latitude: doublePrecision('wgs84_latitude'),
    normalized_crs: text('normalized_crs').notNull(),
    quality: doublePrecision('quality'),
    raw_response: jsonb('raw_response').$type<Record<string, unknown>>().notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    terminal: boolean('terminal').default(false).notNull(),
  },
  (table) => [
    check('geocoding_observations_operation_check', sql`${table.operation} in ('geocode', 'poi_search')`),
    check('geocoding_observations_request_hash_check', sql`length(${table.request_hash}) = 64`),
    check('geocoding_observations_attempt_check', sql`${table.attempt} > 0`),
    check('geocoding_observations_status_check', sql`${table.status} in ('accepted', 'rejected', 'error')`),
    check('geocoding_observations_reported_crs_check', sql`${table.reported_crs} = 'GCJ-02'`),
    check('geocoding_observations_normalized_crs_check', sql`${table.normalized_crs} = 'WGS84'`),
    check('geocoding_observations_quality_check', sql`${table.quality} is null or ${table.quality} between 0 and 1`),
    check(
      'geocoding_observations_gcj02_paired_check',
      sql`(${table.gcj02_latitude} is null) = (${table.gcj02_longitude} is null)`,
    ),
    check(
      'geocoding_observations_wgs84_paired_check',
      sql`(${table.wgs84_latitude} is null) = (${table.wgs84_longitude} is null)`,
    ),
    index('geocoding_observations_venue_observed_idx').on(table.venue_id, table.observed_at.desc()),
    index('geocoding_observations_resume_idx').on(table.provider, table.venue_id, table.request_hash, table.terminal),
  ],
)

export const arcadeGeocodingCoordinateDecisions = arcade.table(
  'geocoding_coordinate_decisions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    observation_id: bigint('observation_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeGeocodingObservations.id),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id),
    decided_at: timestamp('decided_at', { withTimezone: true }).notNull(),
    decision: text('decision').notNull(),
    wgs84_longitude: doublePrecision('wgs84_longitude').notNull(),
    wgs84_latitude: doublePrecision('wgs84_latitude').notNull(),
    reason: text('reason').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('geocoding_coordinate_decisions_observation_id_key').on(table.observation_id),
    check('geocoding_coordinate_decisions_decision_check', sql`${table.decision} in ('applied', 'skipped_non_null')`),
    check('geocoding_coordinate_decisions_latitude_range_check', sql`${table.wgs84_latitude} between -90 and 90`),
    check('geocoding_coordinate_decisions_longitude_range_check', sql`${table.wgs84_longitude} between -180 and 180`),
    index('geocoding_coordinate_decisions_venue_idx').on(table.venue_id, table.decided_at.desc()),
  ],
)

export const arcadeGeocodingCoordinateInvalidations = arcade.table(
  'geocoding_coordinate_invalidations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    decision_id: bigint('decision_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeGeocodingCoordinateDecisions.id),
    venue_id: bigint('venue_id', { mode: 'bigint' })
      .notNull()
      .references(() => arcadeVenues.id),
    invalidated_at: timestamp('invalidated_at', { withTimezone: true }).notNull(),
    prior_wgs84_longitude: doublePrecision('prior_wgs84_longitude').notNull(),
    prior_wgs84_latitude: doublePrecision('prior_wgs84_latitude').notNull(),
    reason: text('reason').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique('geocoding_coordinate_invalidations_decision_id_key').on(table.decision_id),
    check(
      'geocoding_coordinate_invalidations_reason_check',
      sql`${table.reason} in ('trusted_source_attached', 'trusted_source_changed')`,
    ),
    check(
      'geocoding_coordinate_invalidations_latitude_range_check',
      sql`${table.prior_wgs84_latitude} between -90 and 90`,
    ),
    check(
      'geocoding_coordinate_invalidations_longitude_range_check',
      sql`${table.prior_wgs84_longitude} between -180 and 180`,
    ),
    index('geocoding_coordinate_invalidations_venue_idx').on(table.venue_id, table.invalidated_at.desc()),
  ],
)

// --- Relations ---

export const tagGroupsRelations = relations(tagGroups, ({ many }) => ({
  tags: many(tags),
}))

export const tagsRelations = relations(tags, ({ one, many }) => ({
  group: one(tagGroups, {
    fields: [tags.group_id],
    references: [tagGroups.id],
  }),
  createdBy: one(user, {
    fields: [tags.created_by],
    references: [user.id],
  }),
  tagSongs: many(tagSongs),
}))

export const tagSongsRelations = relations(tagSongs, ({ one }) => ({
  tag: one(tags, {
    fields: [tagSongs.tag_id],
    references: [tags.id],
  }),
  createdBy: one(user, {
    fields: [tagSongs.created_by],
    references: [user.id],
  }),
}))

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, {
    fields: [profiles.id],
    references: [user.id],
  }),
}))

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(user, {
    fields: [comments.created_by],
    references: [user.id],
  }),
  parent: one(comments, {
    fields: [comments.parent_id],
    references: [comments.id],
    relationName: 'comment_replies',
  }),
  replies: many(comments, {
    relationName: 'comment_replies',
  }),
}))

export const adminRoleChangeHistoryRelations = relations(adminRoleChangeHistory, ({ one }) => ({
  subject: one(user, {
    fields: [adminRoleChangeHistory.subject_user_id],
    references: [user.id],
    relationName: 'admin_role_change_subject',
  }),
  actor: one(user, {
    fields: [adminRoleChangeHistory.actor_user_id],
    references: [user.id],
    relationName: 'admin_role_change_actor',
  }),
}))

export const adminUserBanHistoryRelations = relations(adminUserBanHistory, ({ one, many }) => ({
  subject: one(user, {
    fields: [adminUserBanHistory.subject_user_id],
    references: [user.id],
    relationName: 'admin_user_ban_subject',
  }),
  actor: one(user, {
    fields: [adminUserBanHistory.actor_user_id],
    references: [user.id],
    relationName: 'admin_user_ban_actor',
  }),
  previousEvent: one(adminUserBanHistory, {
    fields: [adminUserBanHistory.previous_event_id],
    references: [adminUserBanHistory.id],
    relationName: 'admin_user_ban_event_chain',
  }),
  subsequentEvents: many(adminUserBanHistory, {
    relationName: 'admin_user_ban_event_chain',
  }),
  establishedState: one(adminUserBanState),
}))

export const adminUserBanStateRelations = relations(adminUserBanState, ({ one }) => ({
  subject: one(user, {
    fields: [adminUserBanState.subject_user_id],
    references: [user.id],
    relationName: 'admin_user_ban_state_subject',
  }),
  actor: one(user, {
    fields: [adminUserBanState.actor_user_id],
    references: [user.id],
    relationName: 'admin_user_ban_state_actor',
  }),
  establishingEvent: one(adminUserBanHistory, {
    fields: [adminUserBanState.established_by_event_id],
    references: [adminUserBanHistory.id],
  }),
}))

export const songAliasesRelations = relations(songAliases, ({ one }) => ({
  creator: one(user, {
    fields: [songAliases.created_by],
    references: [user.id],
  }),
}))

export const lxnsOauthStatesRelations = relations(lxnsOauthStates, ({ one }) => ({
  user: one(user, {
    fields: [lxnsOauthStates.user_id],
    references: [user.id],
  }),
}))

export const lxnsOauthTokensRelations = relations(lxnsOauthTokens, ({ one }) => ({
  user: one(user, {
    fields: [lxnsOauthTokens.user_id],
    references: [user.id],
  }),
}))

export const userExtraRelations = relations(user, ({ one, many }) => ({
  profile: one(profiles),
  tags: many(tags),
  tagSongs: many(tagSongs),
  comments: many(comments),
  adminRoleChangesAsSubject: many(adminRoleChangeHistory, {
    relationName: 'admin_role_change_subject',
  }),
  adminRoleChangesAsActor: many(adminRoleChangeHistory, {
    relationName: 'admin_role_change_actor',
  }),
  banHistoryAsSubject: many(adminUserBanHistory, {
    relationName: 'admin_user_ban_subject',
  }),
  banHistoryAsActor: many(adminUserBanHistory, {
    relationName: 'admin_user_ban_actor',
  }),
  songAliases: many(songAliases),
  lxnsOauthToken: one(lxnsOauthTokens),
}))