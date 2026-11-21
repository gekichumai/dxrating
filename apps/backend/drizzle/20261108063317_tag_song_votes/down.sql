-- Hand-written rollback for 20261108063317_tag_song_votes. The Drizzle migrator
-- never reads this file; CI runs it in the up -> down -> up round trip
-- (src/test/migration-roundtrip.ts).
--
-- Dropping the table loses every tag vote. Run this only after
--   pg_dump -t tag_song_votes
-- has produced a verified backup. Roll back newer migrations first.
BEGIN;
DROP TABLE IF EXISTS "tag_song_votes";
-- Forget the ledger entry so a later deployment applies the migration again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '20261108063317_tag_song_votes';
COMMIT;
