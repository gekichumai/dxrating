CREATE TABLE "feature_flag_overrides" (
	"flag" text,
	"user_id" text,
	"enabled" boolean NOT NULL,
	"source" text NOT NULL,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY("flag","user_id"),
	CONSTRAINT "feature_flag_overrides_source_check" CHECK ("source" in ('admin', 'opt_in'))
);
--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_user_idx" ON "feature_flag_overrides" ("user_id");--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;