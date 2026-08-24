# admin

`@gekichumai/admin` is the private, client-rendered administrator application. It is a Vite SPA and is intentionally
separate from the public web application's rendering and presentation stack.

## Local development

From the repository root:

```sh
pnpm install
cp apps/backend/.env.example apps/backend/.env.local
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @gekichumai/backend dev
```

In another terminal:

```sh
pnpm --filter @gekichumai/admin dev
```

The development server uses `http://localhost:5174` with `strictPort` enabled because the backend allowlists that exact
administrator origin. It reverse-proxies `/api` to the local backend at `http://localhost:3000` and injects the
local-only Access substitute on `/api/admin` from the backend's `ADMIN_ACCESS_TEST_BYPASS_SECRET`. Vite loads that value
server-side from `apps/backend/.env.local` (or the launching process environment) and refuses to start the development
proxy when it is missing. The proof is never a `VITE_` value and never enters the browser bundle. Do not point the
browser client directly at port 3000 while the backend uses `test_bypass`; direct browser requests cannot supply the
outer access proof.

Useful package checks are:

```sh
pnpm --filter @gekichumai/admin typecheck
pnpm --filter @gekichumai/admin lint
pnpm --filter @gekichumai/admin test
pnpm --filter @gekichumai/admin build
```

`VITE_BACKEND_URL` selects the browser-facing backend origin. It must be an exact absolute origin: no path, credentials,
query, hash, or wildcard. Development and tests default to the local proxy at `http://localhost:5174`; HTTP is otherwise
rejected except for exact loopback hosts, and preview/staging/production builds require HTTPS. Set the production value
explicitly rather than depending on the development fallback.

`VITE_ADMIN_ENVIRONMENT` remains an optional, non-secret label for local or preview builds; the visible marker ignores
it in production. Never put credentials, Cloudflare Access assertions, bypass values, session values, or other secrets
in a `VITE_` variable because Vite embeds those values into the browser bundle. The client sends browser-managed cookies
with requests; backend origin and session controls remain the security boundary.

`VITE_TURNSTILE_SITE_KEY` is the public widget key for password sign-in. Pair it with the backend-only
`TURNSTILE_SECRET_KEY`; enabling only one side is a deployment error. The widget response is held only in component
memory, attached to the single password request as `x-captcha-response`, and discarded after every attempt. OAuth does
not reuse that response. Cloudflare's documented test keys may be used locally, but production keys must match the
deployed admin hostname.

## Authentication and authorization

The deployed admin hostname must remain behind the identity-aware outer access gate. That gate rejects people before
the SPA, its assets, or the application sign-in screen load; the in-app checks complement it and do not emulate it.

Admin uses the regular Better Auth cookie session and existing-account sign-in routes. It deliberately exposes no
registration link or registration request. Password sign-in and the enabled Google/GitHub providers establish only an
ordinary user session. The private `/api/admin/bootstrap` response is the sole browser authority for the effective
administrator role and capability flags—never infer permission from Better Auth session fields or a role label.

The guarded workspace remains unmounted while the session or bootstrap is unresolved. Session expiry, revocation,
ban, demotion, and fresh-login enforcement first cancel active requests and clear the complete React Query cache, then
show a terminal recovery state. Signing out follows the same ordering. The normal session lifetime is unchanged.

Sensitive operations may request a recent primary-authentication window. Password and Google verification call the
private admin endpoints directly so passwords and state-bearing OAuth URLs never enter React Query mutation history,
Web Storage, or application logs. The browser caps a verified window at ten minutes and still treats the backend as
authoritative. A `RECENT_AUTH_REQUIRED` response opens the reusable confirmation UI but never automatically repeats the
original destructive action; a `FRESH_LOGIN_REQUIRED` response instead requires a complete sign-out and sign-in. TOTP
is not part of this flow.

## Route layout

- `/sign-in` is outside the authenticated guard and shell so authentication remains independently loaded.
- `/primary-auth/result` is guarded but outside the workspace shell; it verifies an OAuth completion with the backend
  before returning to operations.
- `/` is the dashboard.
- `/charts`, `/comments`, `/users`, `/administrators`, and `/chart-reports` are typed, lazy top-level destinations.
- Unknown locations and render failures use dedicated recovery states.

The code-based route tree in `src/router.tsx` avoids generated-file drift while retaining compile-time link checking.
Every route component and the authenticated shell are loaded through dynamic imports.

Vite development and preview servers use SPA history fallback because `appType` is explicitly `spa`. A production
static host must apply the equivalent rule: serve a real asset when it exists and otherwise return `index.html` for an
HTML navigation request. Production hosting, edge caching, and its smoke tests are owned by issue #343.

## Private data access

`src/data/admin-client.ts` is the only browser transport. It uses the browser-safe `@gekichumai/admin-contract` root,
targets `/api/admin`, includes cookie credentials, preserves cancellation signals, and adds the compiled private-contract
identifier exactly once. Do not import `@gekichumai/admin-contract/openapi`, the public API contract, or a raw `fetch`
into feature code. The administrator routes and schemas remain absent from public API documentation.

Use the shared query-option builders rather than calling oRPC `queryOptions()` directly. A builder must pass its
`adminQueryKeys` value into oRPC so the transport operation context and React Query cache use the same key, then apply
the matching freshness class. First tag the shared value through the procedure's `queryKey()`, then pass that tagged key
to `queryOptions()` so output/error inference is preserved. `withAdminQueryPolicy` is the extension point for new
procedures; the bootstrap and primary-authentication status builders are concrete examples. Architecture tests enforce
this boundary.

Freshness windows are deliberately resource-specific:

| Resource class                              | `staleTime` |
| ------------------------------------------- | ----------: |
| Bootstrap and primary-authentication status |  15 seconds |
| Dashboard and administrators                |  30 seconds |
| Charts and users                            |  60 seconds |
| Revisions/history                           |   5 minutes |
| Comments and chart reports                  |  15 seconds |

Production queries refetch stale active data on window focus and reconnect. Fresh data stays inside its window, and no
global or feature polling timer is configured. Tests use isolated caches with focus/reconnect behavior and retries
disabled. Reads retry only branded transport failures and typed server failures, at most twice with bounded backoff;
authentication, authorization, validation, conflict, cancellation, compatibility, and other operational failures are
never retried. Mutations have no automatic retry, and the shared invalidation recipes target only the affected list,
detail, history, queue, and dashboard families.

Operational views should connect React Query's real `refetch`, `isFetching`, and `dataUpdatedAt` values to
`OperationalRefresh`. A failed refetch preserves the last successful data and timestamp. Error UI must use
`normalizeAdminError` and local catalog copy, branch on the typed error code, and display only a schema-valid UUID as a
support identifier; raw server messages are not presentation copy.

A compatibility mismatch is rejected from the stable raw error envelope before oRPC decodes a feature response. The
runtime immediately unmounts protected providers, cancels reads, and clears query and mutation caches. It then offers
one user-triggered hard reload recorded in session storage for the compiled identifier. A repeated mismatch or storage,
cache, or reload failure stays on the terminal update-required screen instead of looping or resuming operations.

## Interface rules

Mantine is the only component system in this package. Do not import MUI, Emotion components, UnoCSS, PostHog, public
web presentation components, or public web styles. Use Mantine components and CSS modules for admin-only layout and
polish. Keep user-visible text in `src/i18n.tsx`; adding a locale means adding a complete catalog, registering its
locale code, and selecting it through the same translation provider.

Desktop is the primary workflow. The supported scaffold checks are 1440×900 desktop and 768×1024 tablet portrait.
At tablet width the navigation collapses behind its labelled control, actions wrap, and page content owns any future
horizontal overflow. Wide data tables must eventually use a labelled, keyboard-focusable scroll region instead of
widening the document.
