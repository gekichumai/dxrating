CREATE TABLE "arcade"."installation_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"venue_id" bigint NOT NULL,
	"game_id" text NOT NULL,
	"version" text,
	"cabinet_model" text,
	"region" text,
	"network" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installation_identities_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "installation_identities_logical_identity_unique" UNIQUE NULLS NOT DISTINCT("venue_id","game_id","region","network","version","cabinet_model"),
	CONSTRAINT "installation_identities_public_id_check" CHECK ("arcade"."installation_identities"."public_id" ~ '^dins_[23456789abcdefghjkmnpqrstvwxyz]{10}$')
);
--> statement-breakpoint
ALTER TABLE "arcade"."installations" ADD COLUMN "installation_identity_id" bigint;--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "arcade"."installation_identities" ADD CONSTRAINT "installation_identities_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installation_identities" ADD CONSTRAINT "installation_identities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "arcade"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installation_identities_venue_idx" ON "arcade"."installation_identities" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "installation_identities_game_idx" ON "arcade"."installation_identities" USING btree ("game_id");--> statement-breakpoint
ALTER TABLE "arcade"."installations" ADD CONSTRAINT "installations_installation_identity_id_installation_identities_id_fk" FOREIGN KEY ("installation_identity_id") REFERENCES "arcade"."installation_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installations_identity_idx" ON "arcade"."installations" USING btree ("installation_identity_id");--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD CONSTRAINT "venues_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD CONSTRAINT "venues_public_id_check" CHECK ("arcade"."venues"."public_id" is null or "arcade"."venues"."public_id" ~ '^dven_[23456789abcdefghjkmnpqrstvwxyz]{10}$');