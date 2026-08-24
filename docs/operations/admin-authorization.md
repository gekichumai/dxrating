# Administrator authorization operations

DXRating persists only `user` and `admin` roles. Every Better Auth user-creation path and the database itself default
new accounts to `user`. `super_admin` is an effective role derived at request time; it is never stored in the user
table and cannot be granted by an application endpoint.

## Super-administrator allowlist

`SUPER_ADMIN_USER_IDS` is a JSON array of exact, immutable Better Auth user IDs:

```dotenv
SUPER_ADMIN_USER_IDS='["existing-user-id"]'
SUPER_ADMIN_USER_IDS_EFFECTIVE_AT='2026-08-24T12:00:00.000Z'
```

The account must already exist. Do not configure email addresses, display names, OAuth account/provider IDs, or
other mutable profile values. Matching is case-sensitive and exact. Duplicate IDs are accepted and deduplicated.
Invalid JSON, non-string entries, empty IDs, surrounding whitespace, and control characters make backend startup
fail closed. Startup logs contain only validation status and the deduplicated count; they never contain the IDs.

The parsed allowlist is opaque and immutable to application code. There is no API, database table, or administrator
UI for adding, removing, or enumerating its members.

`SUPER_ADMIN_USER_IDS_EFFECTIVE_AT` is required whenever the list is non-empty. It must be a UTC ISO timestamp and
must advance monotonically whenever membership changes. A super-administrator session is eligible only when its
database-issued authorization timestamp is strictly later than both this generation timestamp and the account's
authorization floor. Equality fails closed. The timestamp is deliberately not exposed by the allowlist object or an
API. The database does not retain allowlist generations, so historic monotonicity is a deployment-system and operator
trust boundary; startup validates the current value's syntax and presence, not its relationship to a previous deploy.

## Changing membership

Changing super-administrator membership is a deployment-configuration operation. For the initial rollout when the
existing list is non-empty, first gate administrator traffic and new session creation. Read the database clock with
`SELECT clock_timestamp()`, choose a future cutoff with enough margin for the full rollout, and deploy every new
binary with the unchanged list plus that cutoff. Drain every generation-unaware binary, revoke affected sessions,
wait until the database clock is strictly past the cutoff, and only then reopen traffic and require a fresh login. A
generation-aware binary intentionally refuses to start with a non-empty list but no cutoff, so do not attempt to
deploy it with only the old variable.

For later membership changes, choose another strictly later cutoff in the future according to the database clock,
then roll the new list and cutoff to every instance and drain the previous configuration before that time passes. Do
not let the cutoff pass while an old binary or old configuration can serve administrator traffic. If the platform
cannot guarantee that ordering, gate administrator traffic and new session creation until rollout, revocation, and
the cutoff are complete.

An addition resolves the account's current effective role as `super_admin`, but every session at or before the new
generation receives `FRESH_LOGIN_REQUIRED`; it remains usable on public routes. A removal lowers authority as soon as
the reduced configuration serves the request. If the account's persisted role is `admin`, removal intentionally falls
back to that authority; demote it separately when ordinary-user authority is intended. Drain all old-configuration
instances before declaring a removal complete.

Use this configuration procedure in either case:

1. Resolve the existing account's immutable Better Auth user ID through an authorized operational database query.
2. Record the previous list and generation, read `clock_timestamp()` from the primary database, then choose a strictly
   later UTC generation timestamp far enough in the future to finish and drain the rollout.
3. Update `SUPER_ADMIN_USER_IDS` and `SUPER_ADMIN_USER_IDS_EFFECTIVE_AT` together on every instance before the cutoff.
   Follow the activation order above; malformed values prevent the replacement backend from starting.
4. Revoke every session for each affected user through the session-revocation service, then require a fresh login. An
   emergency operator using a restricted database connection may execute this equivalent parameterized transaction.
   `$1` below is the client library's bound parameter, not text to paste literally:

   ```sql
   BEGIN;
   SELECT id FROM "user" WHERE id = $1 FOR UPDATE;
   -- The client must assert that SELECT returned exactly one row; otherwise ROLLBACK.
   SELECT id FROM session WHERE user_id = $1 ORDER BY id FOR UPDATE;
   DELETE FROM admin_primary_auth_oauth_attempts WHERE user_id = $1;
   DELETE FROM admin_primary_auth_windows WHERE user_id = $1;
   DELETE FROM session WHERE user_id = $1;
   COMMIT;
   ```

   The client or operator must check the row count before issuing `DELETE`; SQL does not abort automatically when the
   `SELECT` returns no row. Issue `ROLLBACK` and abort instead. Do not rely on an already-open browser session as
   evidence of the new authority.
5. After every instance uses the new generation and the database clock is strictly past it, verify the private
   administrator bootstrap principal after fresh authentication. It returns only the current user ID, effective role,
   and capability flags; it never returns the allowlist or persisted role.

Removing an ID makes subsequent effective-role resolution fall back to the account's persisted `admin` or `user`
role. Adding an ID takes precedence only for a session in the current generation. Restoring the previous list requires
a new, later generation timestamp and another session revocation; never move the timestamp backward.

## Persisted role transitions and sessions

Promotion changes `user → admin` and advances the account authorization floor in one transaction. Existing sessions
are deliberately preserved for public use but cannot call any administrator route. Updating their ordinary expiry or
`updated_at` fields cannot upgrade them because `session.admin_authorization_issued_at` is database-owned and
immutable to Better Auth. A new login creates a session after the floor and gains administrator authority. Ordinary
and administrator sessions use the same Better Auth lifetime.

Demotion changes `admin → user`, advances the floor, deletes every session-bound primary-auth window and OAuth
attempt, and deletes every Better Auth session in one transaction. The reusable revocation primitive takes locks in
user-then-ordered-session order, is idempotent, and intentionally preserves password-attempt rate limits. Future ban
transitions must use the same primitive in their state-change transaction.

Administrator mutations treat the request principal as a fast-path check only. Inside the mutation transaction they
lock actor and target users in sorted ID order, lock the actor's exact live session, lock the recent-primary-auth row
when the procedure requires it, rebuild the current effective role and freshness, and re-run the complete procedure
policy before changing state.

Application code and operator tooling must never update `user.role` directly. Every role change must use the
transactional role-transition service so that the authorization floor, session revocation, and future history record
remain part of the same state change.

## Session-transition deployment and rollback

Apply `0013_add_admin_session_transitions` before deploying this backend. It adds two non-null, database-defaulted
timestamps. Existing session markers are stamped no later than the existing-user authorization floors, making old
administrator sessions stale. Old and new binaries can continue inserting users and sessions because PostgreSQL owns
both defaults, and the fields are omitted from Better Auth's public schema. The migration acquires the `user` table
before `session`, matching live transaction lock order; do not reorder those statements during deployment.

Rolling application code back to a binary that ignores these markers requires an administrator-traffic gate. Drain
the generation-aware fleet, revoke every session belonging to a persisted or effective administrator, restore a
compatible allowlist configuration, and only then expose the older binary. Leave both additive columns in place.
Never reverse the schema migration or reuse an older allowlist generation during an incident rollback.

Role-management endpoints must re-read both actor and target under the authorization policy. Administrators may
moderate effective users only. Super administrators may also moderate persisted administrators and grant or revoke
the `admin` role. No application operation may target an effective super administrator.
