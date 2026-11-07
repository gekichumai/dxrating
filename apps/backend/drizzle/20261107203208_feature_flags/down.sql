-- Hand-written rollback for 20261107203208_feature_flags. The Drizzle migrator
-- never reads this file; CI runs it in the up -> down -> up round trip
-- (scripts/migration-roundtrip.ts).
--
-- Production rollback is: turn CLOUD_SAVE_MODE off, roll back the image and
-- keep the tables. Run this only after
--   pg_dump -t 'score_*' -t feature_flag_overrides
-- has produced a verified backup. Roll back newer migrations first.
BEGIN;
DROP TABLE IF EXISTS "feature_flag_overrides";
-- Forget the ledger entry so a later deployment applies the migration again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '20261107203208_feature_flags';
COMMIT;
