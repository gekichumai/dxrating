# Administrator API errors

The private administrator client must branch on the typed error code, not on the HTTP status or message text. Messages
are safe for display but are not a stable programmatic interface. When an error includes a non-null `requestId`, the
client may show or copy it as a support correlation identifier; it must not treat it as authentication material.

The client should discard privileged page data when authentication or authorization fails. It must never retry an
administrator mutation automatically unless the operation explicitly documents idempotency.

## Client behavior by code

| Code | HTTP status | Administrator client action |
| --- | ---: | --- |
| `UNAUTHENTICATED` | 401 | Clear local administrator state, preserve only a safe return location, and send the user through the normal full sign-in flow. Do not loop retries in the background. |
| `FORBIDDEN` | 403 | Stop the operation, clear privileged page data, and show the access-denied state. Refreshing or signing in again is not presented as a fix; authority may have been removed. |
| `RECENT_AUTH_REQUIRED` | 401 | Preserve the pending intent locally and open the primary-authentication step-up flow when that flow is available. Do not sign the user out, and never replay a mutation until step-up succeeds and the user confirms it. |
| `FRESH_LOGIN_REQUIRED` | 401 | Clear the current session and require a complete sign-in. A step-up prompt is insufficient because the user's authority changed after this session began. Do not replay a mutation automatically after login. |
| `ADMIN_CLIENT_INCOMPATIBLE` | 409 | Stop all administrator operations and show the update-required screen. Reload once to fetch the deployed client; if the compatibility identifier still differs, keep the client blocked rather than falling back to an older request shape. |
| `VALIDATION_FAILED` | 400 | Keep the form open, show the safe validation failure, and let the user correct and resubmit it. Do not render raw server parser errors or echo rejected input into telemetry. |
| `NOT_FOUND` | 404 | Remove or mark the missing item, then refetch the containing list. Do not reveal whether a resource exists to a user who lacks access. |
| `CONFLICT` | 409 | Refetch the resource and present its current state before the user decides whether to try again. Never silently overwrite a concurrent administrator action. |
| `INTERNAL_SERVER_ERROR` | 500 | Show a generic failure, retain no privileged response body, and offer the safe `requestId` for support. A read may be retried with bounded backoff; a mutation requires an explicit user decision unless it is documented as idempotent. |

`RECENT_AUTH_REQUIRED` and `FRESH_LOGIN_REQUIRED` deliberately have different recovery paths. Recent authentication is
a step-up within the current session. Fresh login invalidates the current session as evidence of authority and always
requires full authentication.

## Telemetry and diagnostics

Authorization outcome counters contain only a finite procedure label and a finite result code. Unknown values collapse
to `unknown` or `UNKNOWN`; user IDs, email addresses, comment text, moderation reasons, chart data, credentials, and
request bodies are never labels. Correlation identifiers are retained only when they are valid UUIDs.

Expected 4xx outcomes, including authentication, authorization, validation, not-found, and conflict results, are
operational states and are not sent to Sentry as exceptions. Unexpected server failures may be reported, but the event
uses a replacement error and an allowlist of administrator tags rather than the original exception, request, or user
context.
