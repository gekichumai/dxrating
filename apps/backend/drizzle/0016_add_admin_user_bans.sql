CREATE TABLE "admin_user_ban_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"previous_event_id" bigint,
	"action" text NOT NULL,
	"reason" text,
	"ban_started_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"request_correlation_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_ban_history_previous_event_id_unique" UNIQUE("previous_event_id"),
	CONSTRAINT "admin_user_ban_history_event_identity_unique" UNIQUE("id","subject_user_id","actor_user_id","action"),
	CONSTRAINT "admin_user_ban_history_action_check" CHECK ("admin_user_ban_history"."action" in ('ban', 'unban')),
	CONSTRAINT "admin_user_ban_history_reason_check" CHECK (("admin_user_ban_history"."action" = 'ban'
          and "admin_user_ban_history"."reason" is not null
          and length("admin_user_ban_history"."reason") between 1 and 1000
          and "admin_user_ban_history"."reason" !~ '^[[:space:]]'
          and "admin_user_ban_history"."reason" !~ '[[:space:]]$')
        or ("admin_user_ban_history"."action" = 'unban'
          and ("admin_user_ban_history"."reason" is null
            or (length("admin_user_ban_history"."reason") between 1 and 1000
              and "admin_user_ban_history"."reason" !~ '^[[:space:]]'
              and "admin_user_ban_history"."reason" !~ '[[:space:]]$')))),
	CONSTRAINT "admin_user_ban_history_expiry_check" CHECK (("admin_user_ban_history"."action" = 'ban'
          and "admin_user_ban_history"."ban_started_at" is not null
          and "admin_user_ban_history"."ban_started_at" <= "admin_user_ban_history"."created_at"
          and ("admin_user_ban_history"."expires_at" is null or "admin_user_ban_history"."expires_at" > "admin_user_ban_history"."created_at"))
        or ("admin_user_ban_history"."action" = 'unban'
          and "admin_user_ban_history"."ban_started_at" is null
          and "admin_user_ban_history"."expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "admin_user_ban_state" (
	"subject_user_id" text PRIMARY KEY NOT NULL,
	"established_action" text NOT NULL,
	"ban_started_at" timestamp (3) with time zone,
	"ban_expires_at" timestamp (3) with time zone,
	"ban_reason" text,
	"actor_user_id" text NOT NULL,
	"established_by_event_id" bigint NOT NULL,
	CONSTRAINT "admin_user_ban_state_established_by_event_id_unique" UNIQUE("established_by_event_id"),
	CONSTRAINT "admin_user_ban_state_action_check" CHECK ("admin_user_ban_state"."established_action" in ('ban', 'unban')),
	CONSTRAINT "admin_user_ban_state_projection_check" CHECK (("admin_user_ban_state"."established_action" = 'ban'
          and "admin_user_ban_state"."ban_started_at" is not null
          and "admin_user_ban_state"."ban_reason" is not null
          and length("admin_user_ban_state"."ban_reason") between 1 and 1000
          and "admin_user_ban_state"."ban_reason" !~ '^[[:space:]]'
          and "admin_user_ban_state"."ban_reason" !~ '[[:space:]]$'
          and ("admin_user_ban_state"."ban_expires_at" is null or "admin_user_ban_state"."ban_expires_at" > "admin_user_ban_state"."ban_started_at"))
        or ("admin_user_ban_state"."established_action" = 'unban'
          and "admin_user_ban_state"."ban_started_at" is null
          and "admin_user_ban_state"."ban_expires_at" is null
          and "admin_user_ban_state"."ban_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_user_ban_history" ADD CONSTRAINT "admin_user_ban_history_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_ban_history" ADD CONSTRAINT "admin_user_ban_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_ban_history" ADD CONSTRAINT "admin_user_ban_history_previous_event_id_admin_user_ban_history_id_fk" FOREIGN KEY ("previous_event_id") REFERENCES "public"."admin_user_ban_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_ban_state" ADD CONSTRAINT "admin_user_ban_state_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_ban_state" ADD CONSTRAINT "admin_user_ban_state_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_ban_state" ADD CONSTRAINT "admin_user_ban_state_establishing_event_fk" FOREIGN KEY ("established_by_event_id","subject_user_id","actor_user_id","established_action") REFERENCES "public"."admin_user_ban_history"("id","subject_user_id","actor_user_id","action") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_user_ban_history_subject_created_idx" ON "admin_user_ban_history" USING btree ("subject_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_ban_history_subject_root_unique" ON "admin_user_ban_history" USING btree ("subject_user_id") WHERE "admin_user_ban_history"."previous_event_id" is null;