CREATE TABLE "admin_primary_auth_oauth_attempts" (
	"state_digest" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_primary_auth_oauth_attempts_digest_check" CHECK ("admin_primary_auth_oauth_attempts"."state_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "admin_primary_auth_oauth_attempts_provider_check" CHECK ("admin_primary_auth_oauth_attempts"."provider" = 'google'),
	CONSTRAINT "admin_primary_auth_oauth_attempts_verifier_check" CHECK (length("admin_primary_auth_oauth_attempts"."code_verifier") between 43 and 128 and "admin_primary_auth_oauth_attempts"."code_verifier" ~ '^[A-Za-z0-9._~-]+$'),
	CONSTRAINT "admin_primary_auth_oauth_attempts_expiry_check" CHECK ("admin_primary_auth_oauth_attempts"."expires_at" = "admin_primary_auth_oauth_attempts"."created_at" + interval '10 minutes')
);
--> statement-breakpoint
CREATE TABLE "admin_primary_auth_password_rate_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"failure_count" integer NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_primary_auth_password_rate_limits_count_check" CHECK ("admin_primary_auth_password_rate_limits"."failure_count" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "admin_primary_auth_windows" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_primary_auth_windows_method_check" CHECK ("admin_primary_auth_windows"."method" in ('password', 'google')),
	CONSTRAINT "admin_primary_auth_windows_expiry_check" CHECK ("admin_primary_auth_windows"."expires_at" = "admin_primary_auth_windows"."completed_at" + interval '10 minutes')
);
--> statement-breakpoint
ALTER TABLE "admin_primary_auth_oauth_attempts" ADD CONSTRAINT "admin_primary_auth_oauth_attempts_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_primary_auth_oauth_attempts" ADD CONSTRAINT "admin_primary_auth_oauth_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_primary_auth_oauth_attempts" ADD CONSTRAINT "admin_primary_auth_oauth_attempts_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_primary_auth_password_rate_limits" ADD CONSTRAINT "admin_primary_auth_password_rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_primary_auth_windows" ADD CONSTRAINT "admin_primary_auth_windows_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_primary_auth_windows" ADD CONSTRAINT "admin_primary_auth_windows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_primary_auth_oauth_attempts_session_idx" ON "admin_primary_auth_oauth_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "admin_primary_auth_oauth_attempts_expiry_idx" ON "admin_primary_auth_oauth_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_primary_auth_windows_user_idx" ON "admin_primary_auth_windows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_primary_auth_windows_expiry_idx" ON "admin_primary_auth_windows" USING btree ("expires_at");