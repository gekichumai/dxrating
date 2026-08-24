# `@gekichumai/admin-contract`

This private workspace package is the sole browser-safe contract for DXRating's first-party administrator application. It is intentionally unstable: the backend and `apps/admin` must be updated in the same change whenever this contract breaks. It is not a public API, is not covered by public compatibility guarantees, and must never be composed into `@gekichumai/api-contract` or the public application router.

The backend mounts the implemented contract only at `/api/admin`. Public `/api/v1`, `/spec.json`, `/docs`, and `/.well-known/api-catalog` must not contain routes or schemas from this package.

Administrator management stays in this private namespace. The roster exposes only approved identity, effective-role, role-source, verification, and account-status fields. Role history is readable only through the subject-scoped `/administrators/{userId}/role-history` route, with a bounded opaque cursor and page size. Grant and revoke requests target an existing immutable user ID and carry a server-validated, trimmed internal reason of at most 1,000 characters. The two mutations are marked as super-administrator operations requiring recent primary authentication; neither contract permits `super_admin` as a persisted role transition.

User moderation also stays inside this private namespace. `/users/search` accepts only bounded exact user-ID and canonical case-insensitive email filters, a canonical display-name prefix of at least two characters, effective-role and active-ban filters, and opaque cursor pagination with a default page size of 25 and maximum of 100. Search rows contain only approved identity, effective role, verification, and active account-status fields; current reasons and state-version tokens are available only from the subject detail response. Subject-scoped ban history is separately cursor paginated and never returns authentication, provider, session, passkey, network, or request-correlation data.

Ban and unban procedures are transactional moderation writes requiring the shared ten-minute recent-primary-authentication window and an expected state version. A ban requires a trimmed nonblank reason of at most 1,000 characters. Temporary expiries must be UTC instants strictly after database time and no more than 365 days later; use the explicit permanent variant for longer restrictions. The reason is private moderation data, disclosed outside the admin API only to the affected account after a sign-in credential or provider proof succeeds. Unban accepts no reason, never restores revoked sessions, and advances history without rewriting the original ban event.

Comment moderation exposes privileged immutable evidence only from the subject-scoped `/comments/{commentId}` detail procedure. That response contains the original body and immutable chart, author, parent, and creation fields together with current deletion state and one bounded, comment-bound page of append-only moderation history. Delete requires explicit confirmation, the expected nullable state version, a trimmed nonblank internal reason of at most 1,000 characters, and recent primary authentication. Restore requires explicit confirmation and the current nonnull state version, but accepts no reason and does not require recent primary authentication. Both mutations are transactional hierarchy-checked writes. The private contract exposes no comment edit, content update, revision, hard-delete, or bulk-moderation operation, and never returns request-correlation data in comment responses.

## Compatibility identifier

`ADMIN_CONTRACT_COMPATIBILITY_ID` is a SHA-256 digest of a canonicalized private OpenAPI document. Both the backend and administrator frontend import the generated constant, and the backend rejects a missing or mismatched identifier at the `/api/admin` boundary before routing any procedure. A changed route, schema, or typed error requires regenerating it:

```bash
pnpm --filter @gekichumai/admin-contract openapi:compatibility:update
pnpm --filter @gekichumai/admin-contract openapi:compatibility:check
```

The identifier coordinates first-party deployments; it does not version or stabilize the API for third parties.

## Private OpenAPI document

Generate the document to standard output for local review:

```bash
pnpm --silent admin:openapi > /tmp/dxrating-admin-openapi.json
```

CI generates the document only in an ephemeral temporary file, validates it, and deletes it in the same step. Do not add a runtime route for this document, copy it into a frontend build, publish it as a package, or upload it as a workflow artifact.
