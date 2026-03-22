CREATE TABLE IF NOT EXISTS "lxns_oauth_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lxns_oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lxns_oauth_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lxns_oauth_states" ADD CONSTRAINT "lxns_oauth_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lxns_oauth_tokens" ADD CONSTRAINT "lxns_oauth_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
