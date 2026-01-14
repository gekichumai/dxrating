CREATE TABLE "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"song_id" text NOT NULL,
	"sheet_type" text NOT NULL,
	"sheet_difficulty" text NOT NULL,
	"parent_id" bigint,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"song_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "tag_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"localized_name" text NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_songs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"tag_id" bigint NOT NULL,
	"song_id" text NOT NULL,
	"sheet_type" text NOT NULL,
	"sheet_difficulty" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"localized_name" text NOT NULL,
	"localized_description" text NOT NULL,
	"group_id" bigint
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_songs" ADD CONSTRAINT "tag_songs_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_group_id_tag_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tag_groups"("id") ON DELETE no action ON UPDATE no action;