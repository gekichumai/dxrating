-- Hand-written rollback for 20261103125545_cloud_save. The Drizzle migrator
-- never reads this file; CI runs it in the up -> down -> up round trip
-- (scripts/migration-roundtrip.ts).
--
-- Production rollback is: turn CLOUD_SAVE_MODE off, roll back the image and
-- keep the tables. Run this only after
--   pg_dump -t 'score_*' -t feature_flag_overrides
-- has produced a verified backup. Tables drop in reverse dependency order.
BEGIN;
DROP TABLE IF EXISTS "score_save_snapshots";
DROP TABLE IF EXISTS "score_mutations";
DROP TABLE IF EXISTS "score_record_events";
DROP TABLE IF EXISTS "score_records";
DROP TABLE IF EXISTS "score_import_jobs";
DROP TABLE IF EXISTS "score_saves";
-- Forget the ledger entry so a later deployment applies the migration again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '20261103125545_cloud_save';
COMMIT;
