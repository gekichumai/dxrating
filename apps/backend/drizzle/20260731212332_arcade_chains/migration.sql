CREATE TABLE "arcade"."chains" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_codes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arcade"."venue_chain_decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"venue_id" bigint NOT NULL,
	"classifier_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"decision" text NOT NULL,
	"chain_id" text,
	"previous_chain_id" text,
	"evidence" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_chain_decisions_input_unique" UNIQUE("venue_id","classifier_version","input_hash"),
	CONSTRAINT "venue_chain_decisions_input_hash_check" CHECK (length("arcade"."venue_chain_decisions"."input_hash") = 64),
	CONSTRAINT "venue_chain_decisions_decision_check" CHECK ("arcade"."venue_chain_decisions"."decision" in ('matched', 'unmatched', 'ambiguous')),
	CONSTRAINT "venue_chain_decisions_chain_coherence_check" CHECK (("arcade"."venue_chain_decisions"."decision" = 'matched') = ("arcade"."venue_chain_decisions"."chain_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD COLUMN "chain_id" text;--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" ADD CONSTRAINT "venue_chain_decisions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "arcade"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" ADD CONSTRAINT "venue_chain_decisions_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "arcade"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade"."venue_chain_decisions" ADD CONSTRAINT "venue_chain_decisions_previous_chain_id_chains_id_fk" FOREIGN KEY ("previous_chain_id") REFERENCES "arcade"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_chain_decisions_venue_idx" ON "arcade"."venue_chain_decisions" USING btree ("venue_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD CONSTRAINT "venues_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "arcade"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venues_chain_id_idx" ON "arcade"."venues" USING btree ("chain_id");