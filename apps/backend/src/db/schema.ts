import { pgTable, text, timestamp, bigserial, bigint, type AnyPgColumn, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth-schema.js'

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
  songAliases: many(songAliases),
  lxnsOauthToken: one(lxnsOauthTokens),
}))