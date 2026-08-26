CREATE TABLE "chart_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" text NOT NULL,
	"stable_song_id" text NOT NULL,
	"stable_chart_id" text NOT NULL,
	"publication_channel" text NOT NULL,
	"publication_catalog_run_id" bigint NOT NULL,
	"publication_revision" bigint NOT NULL,
	"publication_fingerprint_sha256" text NOT NULL,
	"target_field_key" text NOT NULL,
	"category" text NOT NULL,
	"current_value" jsonb NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"source_urls" text[] DEFAULT '{}' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"closed_by_user_id" text,
	"closed_at" timestamp (3) with time zone,
	"close_note" text,
	CONSTRAINT "chart_reports_stable_song_id_check" CHECK ("chart_reports"."stable_song_id" ~ '^dsng_[23456789abcdefghjkmnpqrstvwxyz]{10}$'),
	CONSTRAINT "chart_reports_stable_chart_id_check" CHECK ("chart_reports"."stable_chart_id" ~ '^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$'),
	CONSTRAINT "chart_reports_publication_identity_check" CHECK ("chart_reports"."publication_channel" in ('production-v1')
        and "chart_reports"."publication_catalog_run_id" > 0
        and "chart_reports"."publication_revision" > 0
        and "chart_reports"."publication_fingerprint_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "chart_reports_target_field_key_check" CHECK ("chart_reports"."target_field_key" in ('song.title', 'song.artist', 'song.category', 'song.bpm', 'song.image_name', 'song.is_new', 'song.is_locked', 'song.version', 'chart.type', 'chart.difficulty', 'chart.level', 'chart.internal_level', 'chart.multiver_internal_levels', 'chart.note_designer', 'chart.note_counts.tap', 'chart.note_counts.hold', 'chart.note_counts.slide', 'chart.note_counts.touch', 'chart.note_counts.break', 'chart.note_counts.total', 'chart.regions.jp', 'chart.regions.intl', 'chart.regions.cn', 'chart.version', 'chart.release_date', 'chart.internal_id', 'chart.is_special', 'chart.comment')),
	CONSTRAINT "chart_reports_category_check" CHECK ("chart_reports"."category" in ('incorrect_value', 'missing_value', 'outdated_value', 'other')),
	CONSTRAINT "chart_reports_current_value_check" CHECK (
  octet_length("chart_reports"."current_value"::text) <= case
    when "chart_reports"."target_field_key" = 'chart.multiver_internal_levels' then 4296
    else 4096
  end
  and case
    when "chart_reports"."target_field_key" in (
      'song.title', 'song.artist', 'song.category', 'song.image_name', 'song.version', 'chart.version'
    ) then jsonb_typeof("chart_reports"."current_value") = 'string'
      and length("chart_reports"."current_value" #>> '{}') <= 2048
    when "chart_reports"."target_field_key" in ('chart.type', 'chart.difficulty', 'chart.level') then jsonb_typeof("chart_reports"."current_value") = 'string'
      and length("chart_reports"."current_value" #>> '{}') <= 64
    when "chart_reports"."target_field_key" in ('chart.note_designer', 'chart.comment') then jsonb_typeof("chart_reports"."current_value") = 'null'
      or (jsonb_typeof("chart_reports"."current_value") = 'string' and length("chart_reports"."current_value" #>> '{}') <= 2048)
    when "chart_reports"."target_field_key" = 'chart.release_date' then jsonb_typeof("chart_reports"."current_value") = 'null'
      or (jsonb_typeof("chart_reports"."current_value") = 'string'
        and ("chart_reports"."current_value" #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
        and to_char(to_date("chart_reports"."current_value" #>> '{}', 'YYYY-MM-DD'), 'YYYY-MM-DD') = ("chart_reports"."current_value" #>> '{}'))
    when "chart_reports"."target_field_key" in (
      'song.is_new', 'song.is_locked', 'chart.regions.jp', 'chart.regions.intl', 'chart.regions.cn',
      'chart.is_special'
    ) then jsonb_typeof("chart_reports"."current_value") = 'boolean'
    when "chart_reports"."target_field_key" = 'song.bpm' then jsonb_typeof("chart_reports"."current_value") = 'null'
      or (jsonb_typeof("chart_reports"."current_value") = 'number'
        and ("chart_reports"."current_value" #>> '{}')::numeric between 0.001 and 10000
        and scale(("chart_reports"."current_value" #>> '{}')::numeric) <= 3
        and trunc(("chart_reports"."current_value" #>> '{}')::numeric * 1000) = ("chart_reports"."current_value" #>> '{}')::numeric * 1000)
    when "chart_reports"."target_field_key" = 'chart.internal_level' then jsonb_typeof("chart_reports"."current_value") = 'number'
      and ("chart_reports"."current_value" #>> '{}')::numeric between 0 and 100
      and scale(("chart_reports"."current_value" #>> '{}')::numeric) <= 3
      and trunc(("chart_reports"."current_value" #>> '{}')::numeric * 1000) = ("chart_reports"."current_value" #>> '{}')::numeric * 1000
    when "chart_reports"."target_field_key" in (
      'chart.note_counts.tap', 'chart.note_counts.hold', 'chart.note_counts.slide',
      'chart.note_counts.touch', 'chart.note_counts.break', 'chart.note_counts.total'
    ) then jsonb_typeof("chart_reports"."current_value") = 'null'
      or (jsonb_typeof("chart_reports"."current_value") = 'number'
        and ("chart_reports"."current_value" #>> '{}')::numeric between 0 and 1000000
        and trunc(("chart_reports"."current_value" #>> '{}')::numeric) = ("chart_reports"."current_value" #>> '{}')::numeric)
    when "chart_reports"."target_field_key" = 'chart.internal_id' then jsonb_typeof("chart_reports"."current_value") = 'null'
      or (jsonb_typeof("chart_reports"."current_value") = 'number'
        and ("chart_reports"."current_value" #>> '{}')::numeric between 0 and 2147483647
        and trunc(("chart_reports"."current_value" #>> '{}')::numeric) = ("chart_reports"."current_value" #>> '{}')::numeric)
    when "chart_reports"."target_field_key" = 'chart.multiver_internal_levels' then jsonb_typeof("chart_reports"."current_value") in ('null', 'object')
    else true
  end),
	CONSTRAINT "chart_reports_proposed_value_check" CHECK (
  octet_length("chart_reports"."proposed_value"::text) <= case
    when "chart_reports"."target_field_key" = 'chart.multiver_internal_levels' then 4296
    else 4096
  end
  and case
    when "chart_reports"."target_field_key" in (
      'song.title', 'song.artist', 'song.category', 'song.image_name', 'song.version', 'chart.version'
    ) then jsonb_typeof("chart_reports"."proposed_value") = 'string'
      and length("chart_reports"."proposed_value" #>> '{}') <= 2048
    when "chart_reports"."target_field_key" in ('chart.type', 'chart.difficulty', 'chart.level') then jsonb_typeof("chart_reports"."proposed_value") = 'string'
      and length("chart_reports"."proposed_value" #>> '{}') <= 64
    when "chart_reports"."target_field_key" in ('chart.note_designer', 'chart.comment') then jsonb_typeof("chart_reports"."proposed_value") = 'null'
      or (jsonb_typeof("chart_reports"."proposed_value") = 'string' and length("chart_reports"."proposed_value" #>> '{}') <= 2048)
    when "chart_reports"."target_field_key" = 'chart.release_date' then jsonb_typeof("chart_reports"."proposed_value") = 'null'
      or (jsonb_typeof("chart_reports"."proposed_value") = 'string'
        and ("chart_reports"."proposed_value" #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
        and to_char(to_date("chart_reports"."proposed_value" #>> '{}', 'YYYY-MM-DD'), 'YYYY-MM-DD') = ("chart_reports"."proposed_value" #>> '{}'))
    when "chart_reports"."target_field_key" in (
      'song.is_new', 'song.is_locked', 'chart.regions.jp', 'chart.regions.intl', 'chart.regions.cn',
      'chart.is_special'
    ) then jsonb_typeof("chart_reports"."proposed_value") = 'boolean'
    when "chart_reports"."target_field_key" = 'song.bpm' then jsonb_typeof("chart_reports"."proposed_value") = 'null'
      or (jsonb_typeof("chart_reports"."proposed_value") = 'number'
        and ("chart_reports"."proposed_value" #>> '{}')::numeric between 0.001 and 10000
        and scale(("chart_reports"."proposed_value" #>> '{}')::numeric) <= 3
        and trunc(("chart_reports"."proposed_value" #>> '{}')::numeric * 1000) = ("chart_reports"."proposed_value" #>> '{}')::numeric * 1000)
    when "chart_reports"."target_field_key" = 'chart.internal_level' then jsonb_typeof("chart_reports"."proposed_value") = 'number'
      and ("chart_reports"."proposed_value" #>> '{}')::numeric between 0 and 100
      and scale(("chart_reports"."proposed_value" #>> '{}')::numeric) <= 3
      and trunc(("chart_reports"."proposed_value" #>> '{}')::numeric * 1000) = ("chart_reports"."proposed_value" #>> '{}')::numeric * 1000
    when "chart_reports"."target_field_key" in (
      'chart.note_counts.tap', 'chart.note_counts.hold', 'chart.note_counts.slide',
      'chart.note_counts.touch', 'chart.note_counts.break', 'chart.note_counts.total'
    ) then jsonb_typeof("chart_reports"."proposed_value") = 'null'
      or (jsonb_typeof("chart_reports"."proposed_value") = 'number'
        and ("chart_reports"."proposed_value" #>> '{}')::numeric between 0 and 1000000
        and trunc(("chart_reports"."proposed_value" #>> '{}')::numeric) = ("chart_reports"."proposed_value" #>> '{}')::numeric)
    when "chart_reports"."target_field_key" = 'chart.internal_id' then jsonb_typeof("chart_reports"."proposed_value") = 'null'
      or (jsonb_typeof("chart_reports"."proposed_value") = 'number'
        and ("chart_reports"."proposed_value" #>> '{}')::numeric between 0 and 2147483647
        and trunc(("chart_reports"."proposed_value" #>> '{}')::numeric) = ("chart_reports"."proposed_value" #>> '{}')::numeric)
    when "chart_reports"."target_field_key" = 'chart.multiver_internal_levels' then jsonb_typeof("chart_reports"."proposed_value") in ('null', 'object')
    else true
  end),
	CONSTRAINT "chart_reports_explanation_check" CHECK (length("chart_reports"."explanation") between 1 and 4000
        and "chart_reports"."explanation" !~ '^[[:space:]]'
        and "chart_reports"."explanation" !~ '[[:space:]]$'),
	CONSTRAINT "chart_reports_source_urls_check" CHECK (cardinality("chart_reports"."source_urls") between 0 and 5
        and (cardinality("chart_reports"."source_urls") = 0 or array_ndims("chart_reports"."source_urls") = 1)
        and array_position("chart_reports"."source_urls", null) is null),
	CONSTRAINT "chart_reports_state_check" CHECK ("chart_reports"."state" in ('open', 'closed')),
	CONSTRAINT "chart_reports_closure_check" CHECK (("chart_reports"."state" = 'open'
          and "chart_reports"."closed_by_user_id" is null
          and "chart_reports"."closed_at" is null
          and "chart_reports"."close_note" is null)
        or ("chart_reports"."state" = 'closed'
          and "chart_reports"."closed_by_user_id" is not null
          and "chart_reports"."closed_at" is not null
          and "chart_reports"."closed_at" >= "chart_reports"."created_at"
          and ("chart_reports"."close_note" is null
            or (length("chart_reports"."close_note") between 1 and 1000
              and "chart_reports"."close_note" !~ '^[[:space:]]'
              and "chart_reports"."close_note" !~ '[[:space:]]$'))))
);
--> statement-breakpoint
ALTER TABLE "chart_reports" ADD CONSTRAINT "chart_reports_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_reports" ADD CONSTRAINT "chart_reports_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_reports_queue_idx" ON "chart_reports" USING btree (("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_chart_queue_idx" ON "chart_reports" USING btree ("stable_chart_id",("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_field_queue_idx" ON "chart_reports" USING btree ("target_field_key",("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_category_queue_idx" ON "chart_reports" USING btree ("category",("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_reporter_queue_idx" ON "chart_reports" USING btree ("reporter_user_id",("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_publication_revision_queue_idx" ON "chart_reports" USING btree ("publication_revision",("state" = 'open') DESC,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_publication_identity_idx" ON "chart_reports" USING btree ("publication_channel","publication_catalog_run_id","publication_revision","publication_fingerprint_sha256");--> statement-breakpoint
CREATE INDEX "chart_reports_created_idx" ON "chart_reports" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chart_reports_closed_at_idx" ON "chart_reports" USING btree ("closed_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "chart_reports"."state" = 'closed';