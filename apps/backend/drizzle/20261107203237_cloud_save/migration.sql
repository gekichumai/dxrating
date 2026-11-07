CREATE TABLE "score_import_jobs" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"save_id" text NOT NULL,
	"source" text NOT NULL,
	"fetched_by" text NOT NULL,
	"source_account_id" text,
	"source_account_kind" text,
	"trigger" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"raw_payload_sha256" text,
	"counts" jsonb DEFAULT '{}' NOT NULL,
	"error_code" text,
	CONSTRAINT "score_import_jobs_user_id_idempotency_key_key" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "score_import_jobs_id_fetched_by_key" UNIQUE("id","fetched_by"),
	CONSTRAINT "score_import_jobs_source_check" CHECK ("source" IN ('maimai-net-jp', 'maimai-net-intl', 'lxns', 'diving-fish', 'aqua-dx', 'mu-net', 'aqua-sqlite', 'dxrating-json', 'legacy-local')),
	CONSTRAINT "score_import_jobs_fetched_by_check" CHECK ("fetched_by" IN ('server', 'client')),
	CONSTRAINT "score_import_jobs_source_account_kind_check" CHECK ("source_account_kind" IN ('friend_code', 'lxns_friend_code', 'df_username', 'df_qq', 'segaid_hash', 'claimed')),
	CONSTRAINT "score_import_jobs_trigger_check" CHECK ("trigger" IN ('user', 'auto', 'migration')),
	CONSTRAINT "score_import_jobs_status_check" CHECK ("status" IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "score_mutations" (
	"user_id" text,
	"mutation_id" text,
	"save_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_mutations_pkey" PRIMARY KEY("user_id","mutation_id")
);
--> statement-breakpoint
CREATE TABLE "score_record_events" (
	"id" bigserial PRIMARY KEY,
	"save_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sheet_id" text NOT NULL,
	"kind" text NOT NULL,
	"achievement" integer,
	"combo_flag" text,
	"sync_flag" text,
	"dx_score" integer,
	"best50_bucket" text,
	"source" text NOT NULL,
	"claimed_source" text,
	"fetched_by" text NOT NULL,
	"verification" text NOT NULL,
	"entry_method" text,
	"source_account_id" text,
	"import_job_id" text,
	"raw_payload_sha256" text,
	"fetched_at" timestamp with time zone,
	"client_mutation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_record_events_kind_check" CHECK ("kind" IN ('import_applied', 'provenance_upgraded', 'manual_set', 'delete', 'restore', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "score_records" (
	"save_id" text,
	"sheet_id" text,
	"user_id" text NOT NULL,
	"achievement" integer NOT NULL,
	"combo_flag" text,
	"sync_flag" text,
	"dx_score" integer,
	"best50_bucket" text,
	"provider_record_id" text,
	"source" text NOT NULL,
	"claimed_source" text,
	"fetched_by" text NOT NULL,
	"verification" text NOT NULL,
	"entry_method" text NOT NULL,
	"source_account_id" text,
	"import_job_id" text,
	"raw_payload_sha256" text,
	"fetched_at" timestamp with time zone,
	"edited_from_job_id" text,
	"revision" bigint NOT NULL,
	"client_mutation_id" text,
	"value_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "score_records_pkey" PRIMARY KEY("save_id","sheet_id"),
	CONSTRAINT "score_records_sheet_id_check" CHECK ("sheet_id" ~ '^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$'),
	CONSTRAINT "score_records_achievement_check" CHECK ("achievement" BETWEEN 0 AND 1010000),
	CONSTRAINT "score_records_combo_flag_check" CHECK ("combo_flag" IN ('fc', 'fcp', 'ap', 'app')),
	CONSTRAINT "score_records_sync_flag_check" CHECK ("sync_flag" IN ('fs', 'fsp', 'fsd', 'fsdp', 'sync')),
	CONSTRAINT "score_records_dx_score_check" CHECK ("dx_score" >= 0),
	CONSTRAINT "score_records_best50_bucket_check" CHECK ("best50_bucket" IN ('b15', 'b35')),
	CONSTRAINT "score_records_fetched_by_check" CHECK ("fetched_by" IN ('server', 'client')),
	CONSTRAINT "score_records_verification_check" CHECK ("verification" IN ('verified', 'client_reported', 'user_edited')),
	CONSTRAINT "score_records_entry_method_check" CHECK ("entry_method" IN ('import', 'typed', 'keypad', 'photo', 'file', 'migration')),
	CONSTRAINT "score_records_verified_check" CHECK ("verification" <> 'verified' OR ("fetched_by" = 'server' AND "import_job_id" IS NOT NULL AND "raw_payload_sha256" IS NOT NULL AND "fetched_at" IS NOT NULL)),
	CONSTRAINT "score_records_manual_check" CHECK ("source" <> 'manual' OR "verification" <> 'verified'),
	CONSTRAINT "score_records_source_check" CHECK ("source" <> 'demo')
);
--> statement-breakpoint
CREATE TABLE "score_save_snapshots" (
	"id" bigserial PRIMARY KEY,
	"save_id" text NOT NULL,
	"user_id" text NOT NULL,
	"at_revision" bigint NOT NULL,
	"b15_sum" integer NOT NULL,
	"b35_sum" integer NOT NULL,
	"b50_sum" integer NOT NULL,
	"record_count" integer NOT NULL,
	"game_version" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_saves" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"game_version" text,
	"client_profile_key" text,
	"revision" bigint DEFAULT 0 NOT NULL,
	"tombstone_horizon" bigint DEFAULT 0 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "score_saves_name_check" CHECK (char_length("name") BETWEEN 1 AND 64),
	CONSTRAINT "score_saves_region_check" CHECK ("region" IN ('jp', 'intl', 'cn', '_generic'))
);
--> statement-breakpoint
CREATE INDEX "score_import_jobs_save_idx" ON "score_import_jobs" ("save_id","started_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "score_import_jobs_one_running" ON "score_import_jobs" ("save_id","source") WHERE "status" = 'running';--> statement-breakpoint
CREATE INDEX "score_record_events_sheet_idx" ON "score_record_events" ("save_id","sheet_id","id" DESC);--> statement-breakpoint
CREATE INDEX "score_records_cursor_idx" ON "score_records" ("save_id","revision");--> statement-breakpoint
CREATE INDEX "score_records_user_idx" ON "score_records" ("user_id");--> statement-breakpoint
CREATE INDEX "score_save_snapshots_save_idx" ON "score_save_snapshots" ("save_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "score_saves_user_idx" ON "score_saves" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "score_saves_user_profile_key" ON "score_saves" ("user_id","client_profile_key") WHERE "deleted_at" IS NULL AND "client_profile_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "score_import_jobs" ADD CONSTRAINT "score_import_jobs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_import_jobs" ADD CONSTRAINT "score_import_jobs_save_id_score_saves_id_fkey" FOREIGN KEY ("save_id") REFERENCES "score_saves"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_mutations" ADD CONSTRAINT "score_mutations_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_mutations" ADD CONSTRAINT "score_mutations_save_id_score_saves_id_fkey" FOREIGN KEY ("save_id") REFERENCES "score_saves"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_record_events" ADD CONSTRAINT "score_record_events_save_id_score_saves_id_fkey" FOREIGN KEY ("save_id") REFERENCES "score_saves"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_record_events" ADD CONSTRAINT "score_record_events_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_records" ADD CONSTRAINT "score_records_save_id_score_saves_id_fkey" FOREIGN KEY ("save_id") REFERENCES "score_saves"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_records" ADD CONSTRAINT "score_records_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_records" ADD CONSTRAINT "score_records_import_job_id_fetched_by_fkey" FOREIGN KEY ("import_job_id","fetched_by") REFERENCES "score_import_jobs"("id","fetched_by");--> statement-breakpoint
ALTER TABLE "score_save_snapshots" ADD CONSTRAINT "score_save_snapshots_save_id_score_saves_id_fkey" FOREIGN KEY ("save_id") REFERENCES "score_saves"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_save_snapshots" ADD CONSTRAINT "score_save_snapshots_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "score_saves" ADD CONSTRAINT "score_saves_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;