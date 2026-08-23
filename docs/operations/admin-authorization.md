# Administrator authorization operations

DXRating persists only `user` and `admin` roles. Every Better Auth user-creation path and the database itself default
new accounts to `user`. `super_admin` is an effective role derived at request time; it is never stored in the user
table and cannot be granted by an application endpoint.

## Super-administrator allowlist

`SUPER_ADMIN_USER_IDS` is a JSON array of exact, immutable Better Auth user IDs:

```dotenv
SUPER_ADMIN_USER_IDS='["existing-user-id"]'
```

The account must already exist. Do not configure email addresses, display names, OAuth account/provider IDs, or
other mutable profile values. Matching is case-sensitive and exact. Duplicate IDs are accepted and deduplicated.
Invalid JSON, non-string entries, empty IDs, surrounding whitespace, and control characters make backend startup
fail closed. Startup logs contain only validation status and the deduplicated count; they never contain the IDs.

The parsed allowlist is opaque and immutable to application code. There is no API, database table, or administrator
UI for adding, removing, or enumerating its members.

## Changing membership

Changing super-administrator membership is a deployment-configuration operation, but additions and removals have
different safe activation orders.

For an addition, do **not** activate the new ID on a backend that is serving traffic until the automated
session-transition generation/effective-time mechanism is available. Effective roles are resolved on every request,
so deploying first could grant an already-open session authority before it is revoked. If an addition is unavoidable
before that mechanism is available, use a full authentication maintenance window: keep the replacement backend
isolated from all traffic; quiesce and drain every old backend; and block all authentication/session creation at the
ingress for the whole serving fleet. Activate the replacement configuration and revoke every affected session while
no backend can create sessions. Expose only the replacement after the revocation commits, and do not return an
old-configuration instance to service. Blocking only the administrator UI or route is insufficient because the user
could create a new session through a regular authentication route.

For a removal, deploying the reduced allowlist lowers authority immediately. Drain every old-configuration instance;
do not treat the removal as active until only reduced-configuration instances serve traffic. Revoke every affected
session directly afterward and require a fresh login. If the account's persisted role is `admin`, removal falls back
to that authority; demote it separately through the administrator role-transition service when ordinary-user
authority is intended.

Use this configuration procedure in either case:

1. Resolve the existing account's immutable Better Auth user ID through an authorized operational database query.
2. Update `SUPER_ADMIN_USER_IDS` in the backend deployment configuration, preserving valid JSON.
3. Follow the safe addition or removal activation order above. A malformed value prevents the replacement backend
   process from starting.
4. Revoke every session for the affected user through the restricted operational database connection, then require a
   fresh login. Until the automated service replaces this manual step, execute a parameterized transaction. `$1`
   below is the client library's bound parameter, not text to paste literally:

   ```sql
   BEGIN;
   SELECT id FROM "user" WHERE id = $1 FOR UPDATE;
   -- The client must assert that SELECT returned exactly one row; otherwise ROLLBACK.
   DELETE FROM session WHERE user_id = $1;
   COMMIT;
   ```

   The client or operator must check the row count before issuing `DELETE`; SQL does not abort automatically when the
   `SELECT` returns no row. Issue `ROLLBACK` and abort instead. Do not rely on an already-open browser session as
   evidence of the new authority.
5. Verify the private administrator bootstrap principal after fresh authentication. It returns only the current user
   ID, effective role, and capability flags; it never returns the allowlist or persisted role.

Removing an ID makes subsequent effective-role resolution fall back to the account's persisted `admin` or `user`
role. Adding an ID takes precedence over either persisted role. Restoring the previous deployment value and repeating
the session procedure is the rollback.

Role-management endpoints must re-read both actor and target under the authorization policy. Administrators may
moderate effective users only. Super administrators may also moderate persisted administrators and grant or revoke
the `admin` role. No application operation may target an effective super administrator.
