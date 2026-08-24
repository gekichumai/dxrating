# Administrator primary authentication

DXRating requires a recent primary-authentication ceremony before an administrator can perform selected destructive
actions. This is an application authorization layer inside the existing Better Auth session. It does not replace the
Cloudflare Access gate, change the ordinary session lifetime, or add TOTP, recovery codes, or passkey step-up.

## Central action policy

Every administrator procedure declares a typed action from the central policy in `@gekichumai/admin-contract`.
Handlers must not compare timestamps or choose step-up behavior themselves.

| Action | Recent primary authentication |
| --- | --- |
| Grant administrator | Required |
| Revoke administrator | Required |
| Ban user | Required |
| Unban user | Required |
| Delete comment | Required |
| Restore comment | Not required |
| Close chart report | Not required |
| Submit chart report | Not required |
| Read provenance | Not required |
| Read dashboard | Not required |
| Read raw artifact | Not required |

Adding an action requires changing the exhaustive policy and its tests. Protected procedures return the typed
`RECENT_AUTH_REQUIRED` result when the current session has no active window.

## Window and invalidation rules

A successful ceremony writes one row keyed by the current Better Auth session ID and user ID. PostgreSQL supplies the
completion time and enforces `expires_at = completed_at + interval '10 minutes'`. Authorization checks use the
database clock and require both the exact user/session pair and a still-live session. Reading the window or performing
an action never updates either timestamp.

Deleting a Better Auth session or user cascades to its window and outstanding OAuth challenge. A role/ban transition
must call `invalidateAdminPrimaryAuthForUserInTransaction` on the same PostgreSQL transaction before it commits.
Initiation, completion, and invalidation lock rows in the canonical user, session, exact-account order. This makes the
final live session, role, password credential, and linked-provider-account checks serialize with concurrent demotion,
banning, password changes, and account unlinking instead of relying on an earlier request snapshot.

## Password ceremony

The password endpoint uses Better Auth's configured password verifier against the current credential hash. A user
without a password credential performs the same single verifier operation against a process-local dummy hash. Wrong
passwords and absent credentials return the same generic `STEP_UP_FAILED` response.

Password verification slots are reserved in PostgreSQL before the expensive password comparison. At most five
attempts are admitted per user in a fifteen-minute window, including under concurrent requests; later attempts return
the generic `STEP_UP_RATE_LIMITED` response. A successful ceremony clears the counter. Password values are never
persisted, returned, attached to errors, or written to request telemetry.

## Google OAuth ceremony

Google step-up uses a separate authorization-code flow and never invokes Better Auth's normal sign-in or account-link
callbacks. Initiation creates one challenge per current session and persists a SHA-256 state digest, PKCE verifier,
nonce, exact callback URI, and the expected linked Google account. The returned authorization URL necessarily carries
the raw one-time state and nonce through the browser; the admin client must treat that URL as opaque. Starting another
challenge replaces the previous one.

The exact backend callbacks are:

```text
${BETTER_AUTH_URL}/api/admin/primary-auth/oauth/callback/google
```

Register the Google callback as an additional authorized redirect URI. Smoke-test both ordinary sign-in and
administrator step-up after any Google OAuth client change.

The callback runs after Cloudflare Access validation but before application request logging. It requires the same live
Better Auth session, atomically consumes the state for the exact user/session/provider, exchanges the code only on the
backend, and compares the provider's immutable account ID with the account row captured at initiation. It never
creates a user or session, updates a linked account, or stores provider tokens. After consuming the provider callback,
it does not forward the authorization code, state, PKCE verifier, nonce, ID token, access token, or refresh token to
the admin SPA. The SPA receives only a redirect to `/primary-auth/result?status=success` or
`/primary-auth/result?status=failure`, then reads the window status from the admin API.

Google requests an interactive account selection, `max_age=0`, a nonce, and the `auth_time` ID-token claim. Completion
verifies the signed ID token, issuer, audience, nonce, subject, and fresh `auth_time`; a missing or stale claim fails
closed. Enable the `auth_time` claim for the OAuth client before rollout.

Ordinary GitHub login through Better Auth remains supported. GitHub is deliberately unavailable for destructive-action
step-up because its OAuth flow does not expose a signed `auth_time` claim or another documented assertion that proves
fresh primary authentication. An administrator with only GitHub linked must add a password or link Google before
performing a protected mutation. Cloudflare Access MFA remains a separate outer layer and does not relax this rule.

## Deployment and rollback

Apply the additive primary-authentication migration before deploying the backend. The migration creates only new
tables, constraints, and indexes; the prior backend continues to read and write existing user, account, and session
rows. Deploy the new backend only after the migration job succeeds, then verify:

1. password success, generic failure, and rate limiting;
2. Google initiation and the fixed backend callback redirect;
3. same-account success and account-switch rejection;
4. window expiry and sign-out cleanup; and
5. explicit GitHub step-up rejection alongside unchanged ordinary GitHub sign-in and public API behavior.

Rolling the application back is safe because the old binary ignores the new tables. Leave the additive tables in
place during rollback; remove them only through a later contract migration after every new binary has been drained.
