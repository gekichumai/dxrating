import {
  pgTable,
  text,
  timestamp,
  boolean,
  foreignKey,
  integer,
  bigserial,
  bigint,
  type AnyPgColumn,
  jsonb,
} from 'drizzle-orm/pg-core'

// --- Application Tables ---

export const tagGroups = pgTable('tag_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  localized_name: jsonb('localized_name').notNull(),
  color: text('color').notNull(),
})

export const tags = pgTable('tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  created_by: text('created_by').notNull(), // references auth.users in supa, but we might want to loose couple or ref new auth table.
  localized_name: text('localized_name').notNull(),
  localized_description: text('localized_description').notNull(),
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
  created_by: text('created_by').notNull(),
})

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(), // Corrected to text to match Supabase Auth UUIDs
  created_at: timestamp('created_at').defaultNow().notNull(),
  display_name: text('display_name').notNull(),
})

export const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  created_by: text('created_by').notNull(), // references profiles(id) ?
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
  created_by: text('created_by'), // Optional tracking of who created it
})
