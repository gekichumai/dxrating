-- Hand-written rollback for 20261123134711_email_verified_at. The Drizzle migrator never reads this file;
-- CI runs it in the up -> down -> up round trip (scripts/migration-roundtrip.ts).
-- An older image runs on the new schema (Better Auth ignores columns it isn't told about, and nothing in it unverifies
-- an address), so a rollback can keep them.
-- Running this loses the recorded verification times and methods; email_verified itself is kept.
BEGIN;
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_verification_record_check";
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_verification_method_check";
ALTER TABLE "user" DROP COLUMN IF EXISTS "email_verification_method";
ALTER TABLE "user" DROP COLUMN IF EXISTS "email_verified_at";
-- Forget the ledger entry so a later deployment applies the migration again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '20261123134711_email_verified_at';
COMMIT;
