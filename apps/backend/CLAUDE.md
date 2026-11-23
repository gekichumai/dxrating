# Backend (`apps/backend`)

## Stack

- **Runtime**: Node.js 26.12.1
- **Application**: Effect 4 services, layers, typed failures, and scoped resources
- **HTTP adapter**: Hono
- **API Layer**: oRPC 2 with the official Effect handler integration
- **Database**: PostgreSQL via Drizzle Effect PostgreSQL and @effect/sql-pg
- **Auth**: Better Auth (email/password, OAuth, passkeys)
- **Validation**: Zod
- **Error Tracking**: Sentry
- **Build**: Effect diagnostics + TypeScript checking + esbuild production bundle
- **Dev**: `tsx watch`
- **Test**: Vitest 5 and @effect/vitest
- **Lint**: oxlint + official @effect/tsgo diagnostics (errors)

## Commands

```bash
pnpm dev          # Start dev server with hot reload
pnpm build        # Effect diagnostics, TypeScript, and production bundle
pnpm start        # Run production build
pnpm test         # Run tests (vitest)
pnpm lint         # oxlint and strict Effect diagnostics
pnpm lint:effect  # Effect correctness and idiom checks
pnpm db:up        # Start local PostgreSQL (Docker)
pnpm db:down      # Stop local PostgreSQL
```

The reusable `.github/workflows/dxdata-producer-contract.yml` workflow accepts
`consumer_ref` and `producer_ref`. It applies the producer's real migration
ledger, publishes its real-sized fixture through the staged promotion path,
and runs `pnpm --filter @gekichumai/backend test:producer-contract`. Producer CI
should call the workflow with its candidate commit as `producer_ref` so changes
on either side exercise the same contract. The private producer calls this
public workflow with its repository-scoped `GITHUB_TOKEN`; the workflow needs
no cross-repository credential in DXRating.

## Project Structure

```
src/
├── index.ts          # NodeRuntime entry point, scoped listener and shutdown
├── runtime.ts        # Application layer composition and HTTP runtime
├── request-runner.ts # Tracks, interrupts, and joins requests before disposal
├── app.ts            # Hono app: routes, CORS, error handling
├── config.ts         # Env loading (dotenv → .env.local → vault) + Zod schema
├── contract.ts       # oRPC API contracts (type-safe route definitions)
├── router.ts         # oRPC route handler implementations
├── auth.ts           # Better Auth configuration
├── db/
│   ├── index.ts      # Drizzle client
│   ├── schema.ts     # App tables (tags, comments, profiles, song_aliases)
│   └── auth-schema.ts # Better Auth tables (user, session, account, etc.)
├── lib/
│   └── functions/    # MaimaiNET clients (JP/Intl), Sentry setup
├── services/
│   └── functions/    # Oneshot renderer, fetch-net-records
├── routes/           # (Currently empty, routes are in app.ts/router.ts)
└── test/
```

## API Routes

### oRPC (`/api/v1/*`)

- `GET /announcements` — Current and upcoming global announcements (every language and target; clients filter)
- `GET /tags` — List tags, groups, and song associations
- `POST /tags/attach` — Attach tag to song sheet (auth required)
- `POST /comments` — Create comment (auth required)
- `GET /comments` — List comments for song sheet
- `GET /aliases` — List song aliases
- `POST /aliases` — Create song alias (auth required)
- `POST /monitoring/tunnel` — Sentry error tunnel
- `POST /maimai/fetch-records` — Fetch MaimaiNET records
- `GET /me/features`, `POST /me/features/cloud-save/opt-in` — Session-only cloud save flags (tagged `internal`, kept out of `/spec.json`)
- `GET /me/sessions`, `POST /me/sessions/{id}/revoke` — The signed-in user's devices without their tokens, and signing one out by id (tagged `internal`). Better Auth's `list-sessions` returns tokens and so needs a fresh session (`session.freshAge`, one day); this list works for any signed-in session. Revoking still needs a fresh session (403 `FORBIDDEN`, `data.reason: 'SESSION_NOT_FRESH'`)
- Cloud save (`cloudSave.*`, tagged `internal`, behind `cloud_save`): `GET|POST /saves`, `PATCH|DELETE /saves/{id}`,
  `GET /saves/{id}/changes`, `POST /saves/{id}/mutations`, `GET /saves/{id}/records/{sheetId}/events`,
  `POST /saves/{id}/replace`, `GET|POST /saves/{id}/snapshots`, `GET /saves/{id}/imports`, `GET /imports/{jobId}`,
  `GET /me/export` (streamed by a direct Hono route), `POST /saves/{id}/client-imports` (chunked client uploads,
  `client_reported`), and the server imports `POST /saves/{id}/imports/lxns|diving-fish` (oRPC) and
  `POST /saves/{id}/imports/maimai-net` (SSE, a direct Hono route), which also need `server_imports`.

### Direct Routes

- `GET /health` — Health check
- `GET|HEAD /api/v1/dxdata` — Complete published catalog or metadata-only headers
- `POST|GET /api/auth/**` — Better Auth endpoints
- `POST /api/auth/account/set-password` — An account without a password (passkey or social sign-up) sets its first one (`src/lib/set-password.ts`): fresh session required (403 `SESSION_NOT_FRESH`), 400 `PASSWORD_ALREADY_SET` once it has one, sign-up length rules and haveIBeenPwned
- `POST /functions/fetch-net-records/v0` — Fetch NET records (JSON)
- `POST /functions/fetch-net-records/v1/:region` — Fetch NET records (SSE)
- `POST /functions/render-oneshot/v0` — Render player card image
- `GET /docs` — Scalar API docs UI
- `GET /spec.json` — OpenAPI spec

## Environment Variables

Required:

- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth secret key

Optional:

- `PORT` (default: 3000)
- `NODE_ENV` (default: development)
- `BETTER_AUTH_URL` (default: http://localhost:3000)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_B64`, `APPLE_APP_BUNDLE_IDENTIFIER` — Sign in with Apple; the backend derives short-lived client-secret JWTs from the base64-encoded `.p8` key
- `SENTRY_DSN`, `SENTRY_RELEASE` — Sentry config
- `ASSETS_LOCAL_CACHE_DIR` — Local disk cache directory for oneshot renderer assets
- `ASSETS_REMOTE_URL` — Remote asset server URL (default: `https://shama.dxrating.net`)
- `VAULT_SECRET_PATH` — Optional vault secrets file
- `MCP_ANALYTICS_SECRET` — HMAC secret of the daily-rotating MCP analytics distinct_id (random per process if unset)
- `MCP_POSTHOG_KEY`, `MCP_POSTHOG_HOST`, `MCP_ANALYTICS_SAMPLE_RATE`, `MCP_ANALYTICS_DAILY_CAP` — MCP PostHog events (see `src/services/mcp/analytics.ts`)
- `CLOUD_SAVE_MODE` — `off` (default) | `allowlist` | `optin` | `on`; see "Feature flags" below
- `CLOUD_SAVE_ALLOWLIST_EMAILS` — Comma-separated emails that get cloud save while the mode is not `off` (verified emails only, `user.email_verified`: an OAuth provider's word, or a mailed link once mail is on; an email/password or passkey account that hasn't used its link needs `flag:set`). See "Email verification" below
- `SERVER_IMPORTS` — `off` (default) | `on`; server-side imports into cloud saves
- `RESEND_API_KEY` — Resend API key for account email (verification links, password reset). Unset turns mail off: nothing is sent, `/send-verification-email` and `/request-password-reset` answer `VERIFICATION_EMAIL_NOT_ENABLED` / `RESET_PASSWORD_DISABLED`, and a warning is logged at startup. See "Account email" below
- `EMAIL_FROM` — Sender of account email (default `DXRating <no-reply@dxrating.net>`); its domain must be verified at Resend
- `EMAIL_TRANSPORT` — Tests only: `memory` keeps sent mail in `memoryOutbox` (`src/services/mailer.ts`) instead of sending it; refused unless `NODE_ENV=test`
- `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` — purge the edge's public Cache-Tags at startup and invalidate `dxdata` on each new publication (see `src/services/edge-cache.ts`). The token needs only Zone → Cache Purge → Purge on dxrating.net

## Feature flags (cloud save, gekichumai/meta#17)

`src/services/feature-flags.ts` (`FeatureFlags`) answers `isEnabled(flag, userId)`
and caches each user's state in memory for 60 seconds. Precedence for
`cloud_save`:

1. `CLOUD_SAVE_MODE=off` is the kill switch and overrides everything.
2. A `feature_flag_overrides` row decides for its user (`enabled=false` turns one user off).
3. A verified email (`user.email_verified`, however it was verified) in `CLOUD_SAVE_ALLOWLIST_EMAILS` turns it on.
4. Otherwise `on` enables everyone; `allowlist` and `optin` enable nobody.

`server_imports` additionally needs `SERVER_IMPORTS=on` and cloud save; an
`enabled=false` row turns one user off. It defaults to `off` so that enabling
cloud save never also starts server-side writes into saves.

Routes behind a flag use `requireSession` then `requireFeature(flag)` from
`src/orpc-middleware.ts`; a disabled feature answers 404 NOT_FOUND. Their
contracts live in `packages/api-contract/src/private/`, are tagged
`['internal', 'cloud-save']` and never join `publicContractRoutes`.

Grant or revoke a flag for one user (upserts an `admin` override; running
servers see it within 60 seconds):

```bash
pnpm --filter @gekichumai/backend flag:set cloud_save owner@example.com on
node dist/flag-set.js cloud_save owner@example.com off   # in the production image
```

It prints whether the address is verified and, when it is, how and since when
(`email verified by oauth at 2026-01-14T15:01:21Z`; `by email_link` for a
mailed link). `NOT verified` means nobody has proved the address belongs to the
account holder: check it is the right person before granting, or have them use
"Resend verification email" on their account page, after which the allowlist
matches them without `flag:set`. `verified by unknown` is an address verified
before the method was recorded (see below).

### Cloud save services (`src/services/cloud-save/`)

- Every write locks the save row `FOR UPDATE` (`lockSave`, waits bounded by `lock_timeout` 5 s -> `CloudSaveBusy`,
  429) and goes through `RecordWriter` (`records.ts`): each
  bumped row takes the next revision (`save.revision + k`), statements hold at most 1000 rows, and events are written
  for effective changes only (plus the domain's `superseded` event for a superseded manual edit). Ownership is always `user_id`-scoped; another user's save is a plain 404.
- `merge.ts` applies `@gekichumai/maimai-domain` `decideImportMerge` (shared by server and client jobs, PR 6);
  `mutations.ts` applies `decideManualMutation` with the `score_mutations` idempotency ledger; `replace.ts` is the
  explicit whole-document replace; `changes.ts` is the cursor pull; `export.ts` the streamed export.
- `cleanup.ts` runs daily under the request runner (`index.ts`, only while `CLOUD_SAVE_MODE` is not `off`):
  tombstones > 90 days (moving `tombstone_horizon`), events beyond 20 per record, ledger rows > 30 days, saves
  soft-deleted > 30 days, snapshots beyond 100 per save. A transaction-scoped advisory lock keeps it to one
  instance at a time.
- Limits (`src/services/rate-limit.ts`, in memory per instance): `rateLimit` oRPC middleware answers 429 with
  `Retry-After`; `writeConcurrency` lets a user run at most 2 write requests at a time (429 beyond), so waiting
  writers cannot take the whole 5-connection pool; bodies are capped at 1 MB (2 MB for `replace` /
  `client-imports`: a replace carries a whole save, up to 10000 records); snapshot `detail` is at most 16 deep and
  32 KB of JSON.
- Server imports (`server-imports.ts`, `upstream-imports.ts`, `net-import-route.ts`, design §7): the server fetches
  maimai NET (JP/intl), LXNS (stored OAuth token) or the public Diving-Fish B50 and writes `verified` records itself;
  the client never relays them. All or nothing: any failed fetch (after the #368 page retry) fails the job and writes
  nothing. Records resolve through the published catalog (`import-catalog.ts`); unknown charts count as
  `skippedUnknownSheet`. NET: 6/h and 30/day per user, 30/h per address, one per user and four in total at a time.
  Jobs running for 15 minutes are failed as `abandoned` at startup, by the daily cleanup, and when they block a new
  job. `client-imports.ts`: 5000 records per chunk, each chunk its own transaction, resumable by idempotency key.
- Account binding (§10): every write (saves, mutations, replace, client and server imports, the NET import, the beta
  opt-in) must name its account in `X-DXRating-Expected-User` (`CLOUD_SAVE_EXPECTED_USER_HEADER`), or it is answered
  400; a session that is another account is answered 409 `{ reason: 'ACCOUNT_MISMATCH' }` before anything is written.
  Reads check the header when sent. `requireExpectedUser` in `src/orpc-middleware.ts` runs after the feature guard, so
  a disabled feature stays a 404; the opt-in checks it after the opt-in phase. The web sends it through
  `privateApiClientFor(userId)`.
- Credential hygiene (`src/lib/credential-hygiene.ts`, §7.2): SEGA IDs and passwords are never stored or logged. The
  NET and LXNS routes get a scrubbing evlog logger; Sentry never attaches their bodies and scrubs every event,
  breadcrumb and log (keys and the values of running NET requests); PostHog events are scrubbed the same way.
  `src/test/credential-hygiene.test.ts` drives failing imports through every NET route and greps every channel.
- `changes`: `since=0` is a full pull; its later pages pass `mode=full` (never reset by the tombstone horizon); the
  last page's `nextSince` is the save's revision.

### Backup gate and rollback

The cloud save migrations (`*_feature_flags`, `*_cloud_save`) only add tables
and indexes, and each folder carries a hand-written `down.sql` that the
Drizzle migrator never reads. CI runs up -> every `down.sql` newest first ->
up (`pnpm test:migration-roundtrip`).

- Before the first production deploy that contains them: confirm the Coolify
  Postgres backup schedule exists and that a restore from it has been tested,
  then take a manual `pg_dump` right before deploying.
- Rollback: set `CLOUD_SAVE_MODE=off`, roll back the image and keep the
  tables. Old images run unchanged on the new schema.
- Run a `down.sql` only after `pg_dump -t 'score_*' -t feature_flag_overrides`
  has produced a verified backup; run them newest first. Each one also removes
  its migration ledger row so a later deploy applies the migration again.

## Email verification (gekichumai/meta#80)

`user.email_verified` (Better Auth's boolean) is what everything checks. Next
to it, `user.email_verified_at` (timestamptz) and
`user.email_verification_method` record when and how the current address was
first verified; both are null while it is unverified, and a CHECK keeps them
set together. Methods (`EMAIL_VERIFICATION_METHODS` in `src/db/auth-schema.ts`):

- `oauth` — Google, GitHub or Apple said the address is verified, at sign-up or
  on a later sign-in to a linked account
- `email_link` — a mailed verification link or code
- `email_verification_protocol` — the browser proved control of the address
  (Chrome's Email Verification Protocol)
- `admin` — an operator marked it verified
- `unknown` — verified before the columns existed with no OAuth account linked
  (Supabase-era confirmations, or OAuth sign-ups that unlinked their provider),
  or written by a Better Auth route that names no method

`src/lib/email-verification-record.ts` keeps them in step through Better
Auth's `databaseHooks.user` (exposed as `user.additionalFields` with
`input: false`, so clients can't set them): a verified new user is recorded
on creation; writing `emailVerified: false` clears both columns; writing
`email` (a new address) clears them too, or records it at once when the same
write keeps `emailVerified: true` (Better Auth's change-email confirmation);
and any other write of `emailVerified: true` is recorded right after it by
`recordEmailVerification`, which only fills an empty record on a row that is
still verified, so the first verification is kept and a later unverify is not
undone. Code that proves an address itself calls
`markEmailVerified(database, userId, provenEmail, method)`: it verifies only
when the user's current address is the proven one, and returns `verified`,
`already_verified` or `email_mismatch` (treat the last as not verified). The
`*_backfill_email_verified_at` migration gave already-verified users their
`created_at` and `oauth` (an OAuth account is linked) or `unknown`.

### Account email

`src/services/mailer.ts` (`Mailer`) sends mail through Resend's HTTP API with
the shared `HttpClient` (10 s timeout; a failure is logged and reported to
Sentry with its kind and Resend's error name, never the address or the link).
Its transport is `resend` with `RESEND_API_KEY`, `disabled` without it, and
`memory` in tests. `deliver` sends in the background, so a request never waits
on Resend nor shows by its timing that a message went out.

`src/lib/auth-mail.ts` connects it to Better Auth, only while the mailer is
enabled (otherwise Better Auth behaves as before mail existed):

- Verification: a link (24 hours) is mailed after email sign-up and passkey
  sign-up, from a `hooks.after` on those routes rather than Better Auth's
  `sendOnSignUp`. It reads the account after the whole request ran and mails
  only an address that is still unverified, so a sign-up that proved its
  address another way (the Email Verification Protocol) gets no mail. A
  signed-in, unverified account asks for another with `/send-verification-email`.
  `/verify-email` sets `email_verified`; the `update.after` hook above records
  `email_link` (an older link used later changes nothing), and
  `autoSignInAfterVerification` signs the link's holder in.
- Password reset: `/request-password-reset` mails a link (1 hour) and
  `/reset-password` sets the password, signing every session out
  (`revokeSessionsOnPasswordReset`). A passkey or social account without a
  password gets its first one this way. haveIBeenPwned checks the new password.
- Every mailed link goes through Better Auth's endpoint, which checks the token
  and redirects to the web's `/account/verify-email` (`?error=` on failure) or
  `/account/reset-password?token=` in the visitor's language
  (`detectAuthLocale`, with the URL prefix). Any `callbackURL`/`redirectTo` a
  client sends is replaced. `FRONTEND_URL`'s origin is a trusted origin for this.
- Templates (`src/lib/auth-mail-templates.ts`): plain text and simple HTML in
  every supported language, no remote images.
- Limits: Better Auth's defaults hold `/send-verification-email` and
  `/request-password-reset` to 3 a minute per IP in production; `/reset-password`
  and `/verify-email` get 10 a minute; and one address gets at most 3 messages
  of a kind in 15 minutes (in memory, per instance).

## Deployment

Deployed on Coolify with Docker Compose (`docker-compose.prod.yml`):

- Multi-stage Dockerfile (builder → runner)
- Traefik reverse proxy via external `coolify` network
- PostgreSQL 16 with persistent volume

### Coolify Integration

When working on Coolify deployment or integration, use context7 to query the Coolify documentation:

- **Library ID**: `coollabsio/coolify-docs`
- Coolify deploys via Docker Compose with Traefik labels for routing
- Webhook-based deployments triggered via `GET` to webhook URL with `Authorization: Bearer <token>`

## Conventions

- API contracts defined in `contract.ts` using oRPC + Zod, implementations in `router.ts`
- Auth context passed through oRPC handler context (`context.user`)
- Better Auth error responses are translated on the way out (`src/lib/auth-error-localization.ts`, called from `Authentication.handle`, with messages in `src/lib/auth-error-translations.ts` for every supported language but English), not by the `@better-auth/i18n` plugin, whose after-hook misses before-hook, captcha and rate-limit errors. The language is the one `src/lib/auth-locale.ts` detects: Accept-Language, which the web's auth client sets to the page's URL language, then the `dxrating.locale` cookie. Don't add a custom request header for this: the web and the backend deploy separately, and a header the live backend's CORS doesn't allow fails every auth request
- Authorization proofs (gdp-ts): functions that read or change one user's private data demand a proof about their exact arguments. See `src/proofs/README.md`.
- Database schema changes go through Drizzle migrations (`drizzle-kit`)
- ES modules with extensionless relative TypeScript imports. TypeScript uses `bundler` module resolution; esbuild resolves local modules into the production bundle. Keep extensions on actual output and asset paths.
- CORS allows `localhost` for dev, `https://dxrating.net` for production, and `*.dxrating.pages.dev` for preview deployments


## Effect conventions

Application operations return `Effect<A, E, R>` and compose with `Effect.gen`,
`Effect.fn`, and the standard combinators. Keep shared API contracts in Zod so
Hono/oRPC clients retain the existing wire format. Pure parsing, calculations,
and JSX construction stay ordinary pure functions.

Use `Context.Service` services and compose their live `Layer`s in `runtime.ts`.
Provide test services at the test entry point. Model recoverable failures with
specific tagged errors; retain the foreign failure in `cause`. Adapt individual
foreign operations with `Effect.tryPromise` or `Effect.try`, without generic
Promise wrappers, `unknown` error channels, or converting defects into expected
failures. Use `Effect.acquireRelease` and scopes for resource ownership.

Use the official oRPC `handlerGen` integration with the application service
context. Its `effect/wrap` hook registers framework-owned fibers with the
application request supervisor. Hono adapters use `runApp`; Better Auth and
renderer callbacks use native `Effect.runPromise`. Effect 4 preserves original
error identity at that boundary, so no `Either` wrapper or custom cause
unwrapping is needed.

Shutdown closes the listener, interrupts and joins in-flight application work,
including oRPC fibers, and then disposes service layers. Application queries and
transactions use `drizzle-orm/effect-postgres` and `@effect/sql-pg` directly.
Better Auth uses the official Promise-based Drizzle adapter with a separate
node-postgres pool; both pools are scoped and together retain the original
maximum of ten connections. OAuth token exchange/rotation must persist issued
credentials even if the caller cancels. Native transactions roll back on
failure, defect, or interruption and support nested savepoints.

Use the official Effect HTTP client for HTTP requests and response-body Effects.
The request scope owns cancellation through body consumption. Effect spans use
`@effect/opentelemetry` with the existing Sentry provider; do not install a second
provider or exporter.

`pnpm lint:effect` runs the official @effect/tsgo CLI against all backend
TypeScript, including tests and operator scripts. The `diagnosticSeverity` map
in `tsconfig.json` makes correctness and unsafe-pattern rules errors. Both
backend build and root/backend lint run it; no editor-only plugin or patched
compiler is required. Do not disable a rule to hide an application error. Only executable entry points may document a `strictEffectProvide` exception.
Use `@effect/vitest` for Effect-native tests and ordinary Vitest for foreign
Promise/HTTP boundary tests.

## Upgrade compatibility

Effect 4 is pinned to `4.0.0-rc.118`; oRPC's official adapter currently requires
its `2.0.0-beta.40` release. Drizzle's `1.0.0-rc.5-5935859` driver is compatible
with this Effect runtime. The pnpm patch only updates eight PostgreSQL type
imports from `effect/unstable/sql/SqlError` to `effect/sql/SqlError`; it changes no
runtime code. The scoped Effect 3 override keeps Prisma tooling on a patched v3
release without changing the application's Effect 4 runtime. Remove the patch when upstream publishes corrected declarations.

The API continues emitting the v1 error `status` field for deployed clients.
Keep the compatibility tests when updating oRPC. Migration folders use the
current Drizzle Kit format; generate or upgrade them through Drizzle Kit and
verify existing ledgers before release. Never rewrite previously applied SQL.
