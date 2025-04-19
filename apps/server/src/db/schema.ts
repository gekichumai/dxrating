import { pgTable, foreignKey, pgPolicy, uuid, timestamp, text, bigint, jsonb, uniqueIndex, check, index, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const sheetDifficulty = pgEnum("sheet_difficulty", ['basic', 'advanced', 'expert', 'master', 'remaster'])
export const sheetType = pgEnum("sheet_type", ['std', 'dx', 'utage', 'utage2p'])


export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	displayName: text("display_name").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "profiles_id_fkey"
		}),
	pgPolicy("Enable insert for users based on user_id", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(( SELECT auth.uid() AS uid) = id)`  }),
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Enable update for users based on user_id", { as: "permissive", for: "update", to: ["public"] }),
]);

export const tags = pgTable("tags", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "tags_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by").notNull(),
	localizedName: jsonb("localized_name").default({}).notNull(),
	localizedDescription: jsonb("localized_description").default({}).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	groupId: bigint("group_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [tagGroups.id],
			name: "public_tags_group_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "tags_created_by_fkey"
		}),
	pgPolicy("Enable insert for authenticated users only", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`true`  }),
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Enable update for authenticated users only", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const songAliases = pgTable("song_aliases", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "song_aliases_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by").default(sql`auth.uid()`).notNull(),
	songId: text("song_id").notNull(),
	name: text().notNull(),
}, (table) => [
	uniqueIndex("song_aliases_song_id_name_idx").using("btree", table.songId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "song_aliases_created_by_fkey"
		}),
	pgPolicy("Enable insert for users based on user_id", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(( SELECT auth.uid() AS uid) = created_by)`  }),
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"] }),
	check("chk_name_valid", sql`(length(TRIM(BOTH FROM name)) >= 1) AND (name !~ similar_to_escape('%[\x00-\x1F\x7F]%'::text))`),
	check("chk_name_valid_len_up", sql`length(TRIM(BOTH FROM name)) < 100`),
]);

export const tagSongs = pgTable("tag_songs", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "songs_tags_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tagId: bigint("tag_id", { mode: "number" }).notNull(),
	songId: text("song_id").notNull(),
	sheetType: sheetType("sheet_type").notNull(),
	sheetDifficulty: text("sheet_difficulty").notNull(),
	createdBy: uuid("created_by").default(sql`auth.uid()`),
}, (table) => [
	index("tag_songs_song_id_sheet_type_sheet_difficulty_idx").using("btree", table.songId.asc().nullsLast().op("enum_ops"), table.sheetType.asc().nullsLast().op("text_ops"), table.sheetDifficulty.asc().nullsLast().op("enum_ops")),
	uniqueIndex("tag_songs_tag_id_song_id_sheet_type_sheet_difficulty_idx").using("btree", table.tagId.asc().nullsLast().op("int8_ops"), table.songId.asc().nullsLast().op("int8_ops"), table.sheetType.asc().nullsLast().op("text_ops"), table.sheetDifficulty.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "public_tag_songs_created_by_fkey"
		}),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "tag_songs_tag_id_fkey"
		}),
	pgPolicy("Enable insert for users based on user_id", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(( SELECT auth.uid() AS uid) = created_by)`  }),
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"] }),
]);

export const comments = pgTable("comments", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "comments_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by").default(sql`auth.uid()`),
	songId: text("song_id").notNull(),
	sheetType: sheetType("sheet_type").notNull(),
	sheetDifficulty: text("sheet_difficulty").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
	content: text().notNull(),
}, (table) => [
	index("comments_song_id_sheet_type_sheet_difficulty_idx").using("btree", table.songId.asc().nullsLast().op("text_ops"), table.sheetType.asc().nullsLast().op("text_ops"), table.sheetDifficulty.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "comments_created_by_fkey"
		}),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "comments_parent_id_fkey"
		}),
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	check("comments_content_check", sql`(length(TRIM(BOTH FROM content)) >= 1) AND (length(TRIM(BOTH FROM content)) <= 8192)`),
]);

export const tagGroups = pgTable("tag_groups", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "tag_groups_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	localizedName: jsonb("localized_name").notNull(),
	color: text().notNull(),
}, (table) => [
	pgPolicy("Enable read access for all users", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);
