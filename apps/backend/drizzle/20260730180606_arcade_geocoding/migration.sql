CREATE TABLE "arcade"."geocoding_coordinate_decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"observation_id" bigint NOT NULL,
	"venue_id" bigint NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"decision" text NOT NULL,
	"wgs84_longitude" double precision NOT NULL,
	"wgs84_latitude" double precision NOT NULL,
	"reason" text NOT NULL,
	"provenance" jsonb NOT NULL,
	CONSTRAINT "geocoding_coordinate_decisions_observation_id_key" UNIQUE("observation_id"),
	CONSTRAINT "geocoding_coordinate_decisions_decision_check" CHECK ("arcade"."geocoding_coordinate_decisions"."decision" in ('applied', 'skipped_non_null')),
	CONSTRAINT "geocoding_coordinate_decisions_latitude_range_check" CHECK ("arcade"."geocoding_coordinate_decisions"."wgs84_latitude" between -90 and 90),
	CONSTRAINT "geocoding_coordinate_decisions_longitude_range_check" CHECK ("arcade"."geocoding_coordinate_decisions"."wgs84_longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "arcade"."geocoding_coordinate_invalidations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"decision_id" bigint NOT NULL,
	"venue_id" bigint NOT NULL,
	"invalidated_at" timestamp with time zone NOT NULL,
	"prior_wgs84_longitude" double precision NOT NULL,
	"prior_wgs84_latitude" double precision NOT NULL,
	"reason" text NOT NULL,
	"provenance" jsonb NOT NULL,
	CONSTRAINT "geocoding_coordinate_invalidations_decision_id_key" UNIQUE("decision_id"),
	CONSTRAINT "geocoding_coordinate_invalidations_reason_check" CHECK ("arcade"."geocoding_coordinate_invalidations"."reason" in ('trusted_source_attached', 'trusted_source_changed')),
	CONSTRAINT "geocoding_coordinate_invalidations_latitude_range_check" CHECK ("arcade"."geocoding_coordinate_invalidations"."prior_wgs84_latitude" between -90 and 90),
	CONSTRAINT "geocoding_coordinate_invalidations_longitude_range_check" CHECK ("arcade"."geocoding_coordinate_invalidations"."prior_wgs84_longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "arcade"."geocoding_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"venue_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"request_address" text NOT NULL,
	"request_city" text,
	"request_hash" text NOT NULL,
	"attempt" smallint NOT NULL,
	"status" text NOT NULL,
	"infocode" text,
	"level" text,
	"rejection_reason" text,
	"gcj02_longitude" double precision,
	"gcj02_latitude" double precision,
	"reported_crs" text NOT NULL,
	"wgs84_longitude" double precision,
	"wgs84_latitude" double precision,
	"normalized_crs" text NOT NULL,
	"quality" double precision,
	"raw_response" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"terminal" boolean DEFAULT false NOT NULL,
	CONSTRAINT "geocoding_observations_operation_check" CHECK ("arcade"."geocoding_observations"."operation" in ('geocode', 'poi_search')),
	CONSTRAINT "geocoding_observations_request_hash_check" CHECK (length("arcade"."geocoding_observations"."request_hash") = 64),
	CONSTRAINT "geocoding_observations_attempt_check" CHECK ("arcade"."geocoding_observations"."attempt" > 0),
	CONSTRAINT "geocoding_observations_status_check" CHECK ("arcade"."geocoding_observations"."status" in ('accepted', 'rejected', 'error')),
	CONSTRAINT "geocoding_observations_reported_crs_check" CHECK ("arcade"."geocoding_observations"."reported_crs" = 'GCJ-02'),
	CONSTRAINT "geocoding_observations_normalized_crs_check" CHECK ("arcade"."geocoding_observations"."normalized_crs" = 'WGS84'),
	CONSTRAINT "geocoding_observations_quality_check" CHECK ("arcade"."geocoding_observations"."quality" is null or "arcade"."geocoding_observations"."quality" between 0 and 1),
	CONSTRAINT "geocoding_observations_gcj02_paired_check" CHECK (("arcade"."geocoding_observations"."gcj02_latitude" is null) = ("arcade"."geocoding_observations"."gcj02_longitude" is null)),
	CONSTRAINT "geocoding_observations_wgs84_paired_check" CHECK (("arcade"."geocoding_observations"."wgs84_latitude" is null) = ("arcade"."geocoding_observations"."wgs84_longitude" is null))
);
--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_decisions" ADD CONSTRAINT "geocoding_coordinate_decisions_observation_id_geocoding_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "arcade"."geocoding_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_decisions" ADD CONSTRAINT "geocoding_coordinate_decisions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_invalidations" ADD CONSTRAINT "geocoding_coordinate_invalidations_decision_id_geocoding_coordinate_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "arcade"."geocoding_coordinate_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_invalidations" ADD CONSTRAINT "geocoding_coordinate_invalidations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" ADD CONSTRAINT "geocoding_observations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geocoding_coordinate_decisions_venue_idx" ON "arcade"."geocoding_coordinate_decisions" USING btree ("venue_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "geocoding_coordinate_invalidations_venue_idx" ON "arcade"."geocoding_coordinate_invalidations" USING btree ("venue_id","invalidated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "geocoding_observations_venue_observed_idx" ON "arcade"."geocoding_observations" USING btree ("venue_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "geocoding_observations_resume_idx" ON "arcade"."geocoding_observations" USING btree ("provider","venue_id","request_hash","terminal");