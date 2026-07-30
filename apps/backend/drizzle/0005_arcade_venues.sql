CREATE SCHEMA "arcade";
--> statement-breakpoint
CREATE TABLE "arcade"."crawl_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "arcade_crawl_runs_status_check" CHECK ("arcade"."crawl_runs"."status" in ('running', 'succeeded', 'failed')),
	CONSTRAINT "arcade_crawl_runs_record_count_check" CHECK ("arcade"."crawl_runs"."record_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "arcade"."game_source_mappings" (
	"source" text NOT NULL,
	"source_game_id" text NOT NULL,
	"game_id" text NOT NULL,
	"external_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "game_source_mappings_source_source_game_id_pk" PRIMARY KEY("source","source_game_id")
);
--> statement-breakpoint
CREATE TABLE "arcade"."games" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arcade"."installation_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"crawl_run_id" bigint NOT NULL,
	"source" text NOT NULL,
	"source_venue_id" text NOT NULL,
	"game_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"machine_count" integer,
	"version" text,
	"cabinet_model" text,
	"status" text,
	"region" text,
	"network" text,
	"price" text,
	"condition" text,
	"confidence" double precision,
	"source_url" text,
	"raw" jsonb NOT NULL,
	CONSTRAINT "arcade_installation_observations_identity_unique" UNIQUE NULLS NOT DISTINCT("crawl_run_id","source","source_venue_id","game_id","region","network","version","cabinet_model"),
	CONSTRAINT "arcade_installation_observations_count_check" CHECK ("arcade"."installation_observations"."machine_count" is null or "arcade"."installation_observations"."machine_count" >= 0),
	CONSTRAINT "arcade_installation_observations_confidence_check" CHECK ("arcade"."installation_observations"."confidence" is null or "arcade"."installation_observations"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "arcade"."installations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"venue_id" bigint NOT NULL,
	"game_id" text NOT NULL,
	"version" text,
	"cabinet_model" text,
	"machine_count" integer,
	"status" text,
	"region" text,
	"network" text,
	"price" text,
	"condition" text,
	"confidence" double precision,
	"observed_at" timestamp with time zone NOT NULL,
	"last_crawl_run_id" bigint NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"provenance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"absent_since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arcade_installations_identity_unique" UNIQUE NULLS NOT DISTINCT("venue_id","game_id","source","region","network","version","cabinet_model"),
	CONSTRAINT "arcade_installations_count_check" CHECK ("arcade"."installations"."machine_count" is null or "arcade"."installations"."machine_count" >= 0),
	CONSTRAINT "arcade_installations_confidence_check" CHECK ("arcade"."installations"."confidence" is null or "arcade"."installations"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "arcade"."venue_matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_venue_id" text NOT NULL,
	"venue_id" bigint,
	"decision" text NOT NULL,
	"score" double precision,
	"reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by" text NOT NULL,
	"crawl_run_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arcade_venue_matches_decision_check" CHECK ("arcade"."venue_matches"."decision" in ('exact_source_id', 'curated', 'auto', 'ambiguous', 'unmatched')),
	CONSTRAINT "arcade_venue_matches_score_check" CHECK ("arcade"."venue_matches"."score" is null or "arcade"."venue_matches"."score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "arcade"."venue_sources" (
	"source" text NOT NULL,
	"source_venue_id" text NOT NULL,
	"venue_id" bigint,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"address" text,
	"normalized_address" text,
	"country_code" text,
	"region" text,
	"city" text,
	"postal_code" text,
	"phone" text,
	"website_url" text,
	"timezone" text,
	"latitude" double precision,
	"longitude" double precision,
	"source_url" text,
	"payload_hash" text,
	"first_seen_run_id" bigint NOT NULL,
	"last_seen_run_id" bigint NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "venue_sources_source_source_venue_id_pk" PRIMARY KEY("source","source_venue_id"),
	CONSTRAINT "venue_sources_coordinates_paired_check" CHECK (("arcade"."venue_sources"."latitude" is null) = ("arcade"."venue_sources"."longitude" is null)),
	CONSTRAINT "venue_sources_latitude_range_check" CHECK ("arcade"."venue_sources"."latitude" is null or "arcade"."venue_sources"."latitude" between -90 and 90),
	CONSTRAINT "venue_sources_longitude_range_check" CHECK ("arcade"."venue_sources"."longitude" is null or "arcade"."venue_sources"."longitude" between -180 and 180),
	CONSTRAINT "venue_sources_coordinates_nonzero_check" CHECK ("arcade"."venue_sources"."latitude" is null or "arcade"."venue_sources"."latitude" <> 0 or "arcade"."venue_sources"."longitude" <> 0)
);
--> statement-breakpoint
CREATE TABLE "arcade"."venues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country_code" text,
	"region" text,
	"city" text,
	"address" text,
	"normalized_address" text,
	"postal_code" text,
	"phone" text,
	"website_url" text,
	"timezone" text,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_coordinates_paired_check" CHECK (("arcade"."venues"."latitude" is null) = ("arcade"."venues"."longitude" is null)),
	CONSTRAINT "venues_latitude_range_check" CHECK ("arcade"."venues"."latitude" is null or "arcade"."venues"."latitude" between -90 and 90),
	CONSTRAINT "venues_longitude_range_check" CHECK ("arcade"."venues"."longitude" is null or "arcade"."venues"."longitude" between -180 and 180),
	CONSTRAINT "venues_coordinates_nonzero_check" CHECK ("arcade"."venues"."latitude" is null or "arcade"."venues"."latitude" <> 0 or "arcade"."venues"."longitude" <> 0)
);
--> statement-breakpoint
ALTER TABLE "arcade"."game_source_mappings" ADD CONSTRAINT "game_source_mappings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "arcade"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installation_observations" ADD CONSTRAINT "installation_observations_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "arcade"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installation_observations" ADD CONSTRAINT "installation_observations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "arcade"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installations" ADD CONSTRAINT "installations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installations" ADD CONSTRAINT "installations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "arcade"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."installations" ADD CONSTRAINT "installations_last_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("last_crawl_run_id") REFERENCES "arcade"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_matches" ADD CONSTRAINT "venue_matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_matches" ADD CONSTRAINT "venue_matches_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "arcade"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" ADD CONSTRAINT "venue_sources_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" ADD CONSTRAINT "venue_sources_first_seen_run_id_crawl_runs_id_fk" FOREIGN KEY ("first_seen_run_id") REFERENCES "arcade"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" ADD CONSTRAINT "venue_sources_last_seen_run_id_crawl_runs_id_fk" FOREIGN KEY ("last_seen_run_id") REFERENCES "arcade"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_runs_source_started_idx" ON "arcade"."crawl_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_source_mappings_game_id_idx" ON "arcade"."game_source_mappings" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "arcade_games_active_name_idx" ON "arcade"."games" USING btree ("active","name");--> statement-breakpoint
CREATE INDEX "installation_observations_game_idx" ON "arcade"."installation_observations" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "installation_observations_source_venue_idx" ON "arcade"."installation_observations" USING btree ("source","source_venue_id");--> statement-breakpoint
CREATE INDEX "installation_observations_observed_idx" ON "arcade"."installation_observations" USING btree ("observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "installations_game_idx" ON "arcade"."installations" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "installations_venue_active_idx" ON "arcade"."installations" USING btree ("venue_id","absent_since");--> statement-breakpoint
CREATE INDEX "installations_game_active_idx" ON "arcade"."installations" USING btree ("game_id","absent_since");--> statement-breakpoint
CREATE INDEX "venue_matches_source_idx" ON "arcade"."venue_matches" USING btree ("source","source_venue_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "venue_matches_venue_id_idx" ON "arcade"."venue_matches" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_sources_venue_id_idx" ON "arcade"."venue_sources" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_sources_normalized_name_idx" ON "arcade"."venue_sources" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "venue_sources_active_seen_idx" ON "arcade"."venue_sources" USING btree ("active","last_seen_run_id");--> statement-breakpoint
CREATE INDEX "venues_normalized_name_idx" ON "arcade"."venues" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "venues_location_idx" ON "arcade"."venues" USING btree ("country_code","region","city");--> statement-breakpoint
CREATE INDEX "venues_coordinates_idx" ON "arcade"."venues" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "venues_name_address_idx" ON "arcade"."venues" USING btree ("normalized_name","normalized_address");
