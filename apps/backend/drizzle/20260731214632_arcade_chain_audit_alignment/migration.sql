ALTER TABLE "arcade"."venue_chain_decisions" DROP CONSTRAINT IF EXISTS "venue_chain_decisions_input_unique";--> statement-breakpoint
ALTER TABLE "arcade"."chains" ADD CONSTRAINT "chains_country_codes_nonempty_check" CHECK (cardinality("arcade"."chains"."country_codes") > 0);
