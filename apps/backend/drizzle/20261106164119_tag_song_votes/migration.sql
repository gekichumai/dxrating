CREATE TABLE "tag_song_votes" (
	"id" bigserial PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"tag_song_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_song_votes_tag_song_id_user_id_unique" UNIQUE("tag_song_id","user_id"),
	CONSTRAINT "tag_song_votes_value_check" CHECK ("value" in (-1, 1))
);
--> statement-breakpoint
CREATE INDEX "tag_song_votes_user_id_idx" ON "tag_song_votes" ("user_id");--> statement-breakpoint
ALTER TABLE "tag_song_votes" ADD CONSTRAINT "tag_song_votes_tag_song_id_tag_songs_id_fkey" FOREIGN KEY ("tag_song_id") REFERENCES "tag_songs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag_song_votes" ADD CONSTRAINT "tag_song_votes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;