-- Custom SQL migration file, put your code below! --
-- Backfill for gekichumai/meta#80: record when and how every already-verified address was verified.
--
-- Until now only two writers set email_verified = true:
--   * Better Auth, when an OAuth provider (Google, GitHub, Apple) said the address is verified. Nothing sends mail,
--     and email/password and passkey sign-ups are always unverified.
--   * scripts/migrate-from-supabase.ts, from Supabase's email_confirmed_at. That covers Supabase OAuth sign-ins and
--     Supabase's own email confirmation (or its auto-confirm), and the script did not keep which one.
-- The real verification time is not stored anywhere, so created_at stands in for it (a timestamp without time zone
-- that the server writes in UTC).
-- A user with an OAuth account linked is recorded as 'oauth'. One without any is 'unknown': a Supabase-era
-- confirmation, or an OAuth sign-up that set a password and then unlinked its provider.
UPDATE "user" AS u
SET
  "email_verified_at" = u."created_at" AT TIME ZONE 'UTC',
  "email_verification_method" = CASE
    WHEN EXISTS (SELECT 1 FROM "account" AS a WHERE a."user_id" = u."id" AND a."provider_id" <> 'credential')
      THEN 'oauth'
    ELSE 'unknown'
  END
WHERE u."email_verified" AND u."email_verified_at" IS NULL;
