-- Hand-written rollback for 20261123134726_backfill_email_verified_at. The Drizzle migrator never reads this file;
-- CI runs it in the up -> down -> up round trip (scripts/migration-roundtrip.ts).
-- The backfilled values are dropped with their columns by 20261123134711_email_verified_at/down.sql; this only
-- forgets the ledger entry so a later deployment applies the backfill again.
BEGIN;
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '20261123134726_backfill_email_verified_at';
COMMIT;
