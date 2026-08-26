CREATE TABLE "admin_comment_moderation_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"comment_id" bigint NOT NULL,
	"actor_user_id" text NOT NULL,
	"previous_event_id" bigint,
	"action" text NOT NULL,
	"reason" text,
	"request_correlation_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_comment_moderation_history_previous_event_id_unique" UNIQUE("previous_event_id"),
	CONSTRAINT "admin_comment_moderation_history_event_identity_unique" UNIQUE("id","comment_id","actor_user_id","action","created_at"),
	CONSTRAINT "admin_comment_moderation_history_action_check" CHECK ("admin_comment_moderation_history"."action" in ('delete', 'restore')),
	CONSTRAINT "admin_comment_moderation_history_reason_check" CHECK (("admin_comment_moderation_history"."action" = 'delete'
          and "admin_comment_moderation_history"."reason" is not null
          and length("admin_comment_moderation_history"."reason") between 1 and 1000
          and "admin_comment_moderation_history"."reason" !~ '^[[:space:]]'
          and "admin_comment_moderation_history"."reason" !~ '[[:space:]]$')
        or ("admin_comment_moderation_history"."action" = 'restore' and "admin_comment_moderation_history"."reason" is null))
);
--> statement-breakpoint
CREATE TABLE "admin_comment_moderation_state" (
	"comment_id" bigint PRIMARY KEY NOT NULL,
	"established_action" text NOT NULL,
	"deletion_reason" text,
	"actor_user_id" text NOT NULL,
	"established_by_event_id" bigint NOT NULL,
	"moderated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "admin_comment_moderation_state_established_by_event_id_unique" UNIQUE("established_by_event_id"),
	CONSTRAINT "admin_comment_moderation_state_action_check" CHECK ("admin_comment_moderation_state"."established_action" in ('delete', 'restore')),
	CONSTRAINT "admin_comment_moderation_state_projection_check" CHECK (("admin_comment_moderation_state"."established_action" = 'delete'
          and "admin_comment_moderation_state"."deletion_reason" is not null
          and length("admin_comment_moderation_state"."deletion_reason") between 1 and 1000
          and "admin_comment_moderation_state"."deletion_reason" !~ '^[[:space:]]'
          and "admin_comment_moderation_state"."deletion_reason" !~ '[[:space:]]$')
        or ("admin_comment_moderation_state"."established_action" = 'restore' and "admin_comment_moderation_state"."deletion_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_history" ADD CONSTRAINT "admin_comment_moderation_history_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_history" ADD CONSTRAINT "admin_comment_moderation_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_history" ADD CONSTRAINT "admin_comment_moderation_history_previous_event_id_admin_comment_moderation_history_id_fk" FOREIGN KEY ("previous_event_id") REFERENCES "public"."admin_comment_moderation_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_state" ADD CONSTRAINT "admin_comment_moderation_state_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_state" ADD CONSTRAINT "admin_comment_moderation_state_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_comment_moderation_state" ADD CONSTRAINT "admin_comment_moderation_state_establishing_event_fk" FOREIGN KEY ("established_by_event_id","comment_id","actor_user_id","established_action","moderated_at") REFERENCES "public"."admin_comment_moderation_history"("id","comment_id","actor_user_id","action","created_at") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_comment_moderation_history_comment_created_idx" ON "admin_comment_moderation_history" USING btree ("comment_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "admin_comment_moderation_history_comment_root_unique" ON "admin_comment_moderation_history" USING btree ("comment_id") WHERE "admin_comment_moderation_history"."previous_event_id" is null;--> statement-breakpoint
CREATE INDEX "admin_comment_moderation_state_deleted_recent_idx" ON "admin_comment_moderation_state" USING btree ("moderated_at" DESC NULLS LAST,"comment_id" DESC NULLS LAST) WHERE "admin_comment_moderation_state"."established_action" = 'delete';