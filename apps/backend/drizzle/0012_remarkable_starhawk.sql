CREATE TABLE "tag_song_votes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"tag_song_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	CONSTRAINT "tag_song_votes_tag_song_id_user_id_unique" UNIQUE("tag_song_id","user_id"),
	CONSTRAINT "tag_song_votes_value_check" CHECK ("tag_song_votes"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "tag_song_votes" ADD CONSTRAINT "tag_song_votes_tag_song_id_tag_songs_id_fk" FOREIGN KEY ("tag_song_id") REFERENCES "public"."tag_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_song_votes" ADD CONSTRAINT "tag_song_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tag_song_votes_tag_song_id_idx" ON "tag_song_votes" USING btree ("tag_song_id");