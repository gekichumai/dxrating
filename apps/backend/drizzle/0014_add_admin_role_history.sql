CREATE TABLE "admin_role_change_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"previous_role" "user_role" NOT NULL,
	"new_role" "user_role" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_role_change_history_transition_check" CHECK (("admin_role_change_history"."previous_role" = 'user' and "admin_role_change_history"."new_role" = 'admin')
        or ("admin_role_change_history"."previous_role" = 'admin' and "admin_role_change_history"."new_role" = 'user')),
	CONSTRAINT "admin_role_change_history_reason_check" CHECK (length("admin_role_change_history"."reason") between 1 and 1000
        and "admin_role_change_history"."reason" !~ '^[[:space:]]'
        and "admin_role_change_history"."reason" !~ '[[:space:]]$')
);
--> statement-breakpoint
ALTER TABLE "admin_role_change_history" ADD CONSTRAINT "admin_role_change_history_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_change_history" ADD CONSTRAINT "admin_role_change_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_role_change_history_subject_created_idx" ON "admin_role_change_history" USING btree ("subject_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);