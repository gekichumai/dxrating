import { relations } from "drizzle-orm/relations";
import { usersInAuth, profiles, tagGroups, tags, songAliases, tagSongs, comments } from "./schema";

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profiles: many(profiles),
	tags: many(tags),
	songAliases: many(songAliases),
	tagSongs: many(tagSongs),
	comments: many(comments),
}));

export const tagsRelations = relations(tags, ({one, many}) => ({
	tagGroup: one(tagGroups, {
		fields: [tags.groupId],
		references: [tagGroups.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [tags.createdBy],
		references: [usersInAuth.id]
	}),
	tagSongs: many(tagSongs),
}));

export const tagGroupsRelations = relations(tagGroups, ({many}) => ({
	tags: many(tags),
}));

export const songAliasesRelations = relations(songAliases, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [songAliases.createdBy],
		references: [usersInAuth.id]
	}),
}));

export const tagSongsRelations = relations(tagSongs, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [tagSongs.createdBy],
		references: [usersInAuth.id]
	}),
	tag: one(tags, {
		fields: [tagSongs.tagId],
		references: [tags.id]
	}),
}));

export const commentsRelations = relations(comments, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [comments.createdBy],
		references: [usersInAuth.id]
	}),
	comment: one(comments, {
		fields: [comments.parentId],
		references: [comments.id],
		relationName: "comments_parentId_comments_id"
	}),
	comments: many(comments, {
		relationName: "comments_parentId_comments_id"
	}),
}));