CREATE TABLE "chart_report_global_rate_limits" (
	"singleton_key" smallint PRIMARY KEY NOT NULL,
	"window_started_at" timestamp (3) with time zone NOT NULL,
	"attempt_count" bigint NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chart_report_global_rate_limits_singleton_check" CHECK ("chart_report_global_rate_limits"."singleton_key" = 1),
	CONSTRAINT "chart_report_global_rate_limits_count_check" CHECK ("chart_report_global_rate_limits"."attempt_count" >= 1),
	CONSTRAINT "chart_report_global_rate_limits_window_check" CHECK ("chart_report_global_rate_limits"."expires_at" > "chart_report_global_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "chart_report_user_rate_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp (3) with time zone NOT NULL,
	"attempt_count" bigint NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chart_report_user_rate_limits_count_check" CHECK ("chart_report_user_rate_limits"."attempt_count" >= 1),
	CONSTRAINT "chart_report_user_rate_limits_window_check" CHECK ("chart_report_user_rate_limits"."expires_at" > "chart_report_user_rate_limits"."window_started_at")
);
--> statement-breakpoint
ALTER TABLE "chart_report_user_rate_limits" ADD CONSTRAINT "chart_report_user_rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_report_user_rate_limits_expiry_idx" ON "chart_report_user_rate_limits" USING btree ("expires_at","user_id");