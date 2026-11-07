CREATE TABLE "announcements" (
	"id" bigserial PRIMARY KEY,
	"revision" integer DEFAULT 1 NOT NULL,
	"severity" text NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"link_url" text,
	"link_label" jsonb,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_app_version" text,
	"max_app_version" text,
	"dismissible" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical')),
	CONSTRAINT "announcements_title_has_en" CHECK ("title" ? 'en'),
	CONSTRAINT "announcements_body_has_en" CHECK ("body" ? 'en'),
	CONSTRAINT "announcements_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
	CONSTRAINT "announcements_platforms_check" CHECK ("platforms" <@ ARRAY['web', 'ios']::text[]),
	CONSTRAINT "announcements_regions_check" CHECK ("regions" <@ ARRAY['jp', 'intl', 'cn']::text[])
);
--> statement-breakpoint
CREATE INDEX "announcements_ends_at" ON "announcements" ("ends_at");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "arcade"."chains" DROP CONSTRAINT "chains_country_codes_nonempty_check", ADD CONSTRAINT "chains_country_codes_nonempty_check" CHECK (cardinality("country_codes") > 0);--> statement-breakpoint
ALTER TABLE "arcade"."crawl_runs" DROP CONSTRAINT "arcade_crawl_runs_status_check", ADD CONSTRAINT "arcade_crawl_runs_status_check" CHECK ("status" in ('running', 'succeeded', 'failed'));--> statement-breakpoint
ALTER TABLE "arcade"."crawl_runs" DROP CONSTRAINT "arcade_crawl_runs_record_count_check", ADD CONSTRAINT "arcade_crawl_runs_record_count_check" CHECK ("record_count" >= 0);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_decisions" DROP CONSTRAINT "geocoding_coordinate_decisions_decision_check", ADD CONSTRAINT "geocoding_coordinate_decisions_decision_check" CHECK ("decision" in ('applied', 'skipped_non_null'));--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_decisions" DROP CONSTRAINT "geocoding_coordinate_decisions_latitude_range_check", ADD CONSTRAINT "geocoding_coordinate_decisions_latitude_range_check" CHECK ("wgs84_latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_decisions" DROP CONSTRAINT "geocoding_coordinate_decisions_longitude_range_check", ADD CONSTRAINT "geocoding_coordinate_decisions_longitude_range_check" CHECK ("wgs84_longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_invalidations" DROP CONSTRAINT "geocoding_coordinate_invalidations_reason_check", ADD CONSTRAINT "geocoding_coordinate_invalidations_reason_check" CHECK ("reason" in ('trusted_source_attached', 'trusted_source_changed'));--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_invalidations" DROP CONSTRAINT "geocoding_coordinate_invalidations_latitude_range_check", ADD CONSTRAINT "geocoding_coordinate_invalidations_latitude_range_check" CHECK ("prior_wgs84_latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_coordinate_invalidations" DROP CONSTRAINT "geocoding_coordinate_invalidations_longitude_range_check", ADD CONSTRAINT "geocoding_coordinate_invalidations_longitude_range_check" CHECK ("prior_wgs84_longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_operation_check", ADD CONSTRAINT "geocoding_observations_operation_check" CHECK ("operation" in ('geocode', 'poi_search'));--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_request_hash_check", ADD CONSTRAINT "geocoding_observations_request_hash_check" CHECK (length("request_hash") = 64);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_attempt_check", ADD CONSTRAINT "geocoding_observations_attempt_check" CHECK ("attempt" > 0);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_status_check", ADD CONSTRAINT "geocoding_observations_status_check" CHECK ("status" in ('accepted', 'rejected', 'error'));--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_reported_crs_check", ADD CONSTRAINT "geocoding_observations_reported_crs_check" CHECK ("reported_crs" = 'GCJ-02');--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_normalized_crs_check", ADD CONSTRAINT "geocoding_observations_normalized_crs_check" CHECK ("normalized_crs" = 'WGS84');--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_quality_check", ADD CONSTRAINT "geocoding_observations_quality_check" CHECK ("quality" is null or "quality" between 0 and 1);--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_gcj02_paired_check", ADD CONSTRAINT "geocoding_observations_gcj02_paired_check" CHECK (("gcj02_latitude" is null) = ("gcj02_longitude" is null));--> statement-breakpoint
ALTER TABLE "arcade"."geocoding_observations" DROP CONSTRAINT "geocoding_observations_wgs84_paired_check", ADD CONSTRAINT "geocoding_observations_wgs84_paired_check" CHECK (("wgs84_latitude" is null) = ("wgs84_longitude" is null));--> statement-breakpoint
ALTER TABLE "arcade"."installation_identities" DROP CONSTRAINT "installation_identities_public_id_check", ADD CONSTRAINT "installation_identities_public_id_check" CHECK ("public_id" ~ '^dins_[23456789abcdefghjkmnpqrstvwxyz]{10}$');--> statement-breakpoint
ALTER TABLE "arcade"."installation_observations" DROP CONSTRAINT "arcade_installation_observations_count_check", ADD CONSTRAINT "arcade_installation_observations_count_check" CHECK ("machine_count" is null or "machine_count" >= 0);--> statement-breakpoint
ALTER TABLE "arcade"."installation_observations" DROP CONSTRAINT "arcade_installation_observations_confidence_check", ADD CONSTRAINT "arcade_installation_observations_confidence_check" CHECK ("confidence" is null or "confidence" between 0 and 1);--> statement-breakpoint
ALTER TABLE "arcade"."installations" DROP CONSTRAINT "arcade_installations_count_check", ADD CONSTRAINT "arcade_installations_count_check" CHECK ("machine_count" is null or "machine_count" >= 0);--> statement-breakpoint
ALTER TABLE "arcade"."installations" DROP CONSTRAINT "arcade_installations_confidence_check", ADD CONSTRAINT "arcade_installations_confidence_check" CHECK ("confidence" is null or "confidence" between 0 and 1);--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" DROP CONSTRAINT "venue_chain_decisions_input_hash_check", ADD CONSTRAINT "venue_chain_decisions_input_hash_check" CHECK (length("input_hash") = 64);--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" DROP CONSTRAINT "venue_chain_decisions_decision_check", ADD CONSTRAINT "venue_chain_decisions_decision_check" CHECK ("decision" in ('matched', 'unmatched', 'ambiguous'));--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" DROP CONSTRAINT "venue_chain_decisions_chain_coherence_check", ADD CONSTRAINT "venue_chain_decisions_chain_coherence_check" CHECK (("decision" = 'matched') = ("chain_id" is not null));--> statement-breakpoint
ALTER TABLE "arcade"."venue_matches" DROP CONSTRAINT "arcade_venue_matches_decision_check", ADD CONSTRAINT "arcade_venue_matches_decision_check" CHECK ("decision" in ('exact_source_id', 'curated', 'auto', 'ambiguous', 'unmatched'));--> statement-breakpoint
ALTER TABLE "arcade"."venue_matches" DROP CONSTRAINT "arcade_venue_matches_score_check", ADD CONSTRAINT "arcade_venue_matches_score_check" CHECK ("score" is null or "score" between 0 and 1);--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" DROP CONSTRAINT "venue_sources_coordinates_paired_check", ADD CONSTRAINT "venue_sources_coordinates_paired_check" CHECK (("latitude" is null) = ("longitude" is null));--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" DROP CONSTRAINT "venue_sources_latitude_range_check", ADD CONSTRAINT "venue_sources_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" DROP CONSTRAINT "venue_sources_longitude_range_check", ADD CONSTRAINT "venue_sources_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "arcade"."venue_sources" DROP CONSTRAINT "venue_sources_coordinates_nonzero_check", ADD CONSTRAINT "venue_sources_coordinates_nonzero_check" CHECK ("latitude" is null or "latitude" <> 0 or "longitude" <> 0);--> statement-breakpoint
ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_public_id_check", ADD CONSTRAINT "venues_public_id_check" CHECK ("public_id" ~ '^dven_[23456789abcdefghjkmnpqrstvwxyz]{10}$');--> statement-breakpoint
ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_coordinates_paired_check", ADD CONSTRAINT "venues_coordinates_paired_check" CHECK (("latitude" is null) = ("longitude" is null));--> statement-breakpoint
ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_latitude_range_check", ADD CONSTRAINT "venues_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_longitude_range_check", ADD CONSTRAINT "venues_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_coordinates_nonzero_check", ADD CONSTRAINT "venues_coordinates_nonzero_check" CHECK ("latitude" is null or "latitude" <> 0 or "longitude" <> 0);--> statement-breakpoint
ALTER TABLE "user_blocks" DROP CONSTRAINT "user_blocks_not_self", ADD CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");