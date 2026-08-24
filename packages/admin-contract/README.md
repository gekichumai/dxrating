# `@gekichumai/admin-contract`

This private workspace package is the sole browser-safe contract for DXRating's first-party administrator application. It is intentionally unstable: the backend and `apps/admin` must be updated in the same change whenever this contract breaks. It is not a public API, is not covered by public compatibility guarantees, and must never be composed into `@gekichumai/api-contract` or the public application router.

The backend mounts the implemented contract only at `/api/admin`. Public `/api/v1`, `/spec.json`, `/docs`, and `/.well-known/api-catalog` must not contain routes or schemas from this package.

Administrator management stays in this private namespace. The roster exposes only approved identity, effective-role, role-source, verification, and account-status fields. Role history is readable only through the subject-scoped `/administrators/{userId}/role-history` route, with a bounded opaque cursor and page size. Grant and revoke requests target an existing immutable user ID and carry a server-validated, trimmed internal reason of at most 1,000 characters. The two mutations are marked as super-administrator operations requiring recent primary authentication; neither contract permits `super_admin` as a persisted role transition.

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
