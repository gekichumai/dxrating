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
- `GET /tags/sheet` — List one sheet's tag associations with vote breakdowns, including buried ones
- `POST /tags/vote` — Cast or change a vote on a tag-sheet association (auth required)
- `GET /tags/user-votes` — Get the caller's own votes for a set of associations (auth required)
- `POST /tags/detach` — Remove an association within an hour of creating it (auth required)
- `POST /comments` — Create comment (auth required)
- `GET /comments` — List comments for song sheet
- `GET /aliases` — List song aliases
- `POST /aliases` — Create song alias (auth required)
- `POST /monitoring/tunnel` — Sentry error tunnel
- `POST /maimai/fetch-records` — Fetch MaimaiNET records
- `GET /me/features`, `POST /me/features/cloud-save/opt-in` — Session-only cloud save flags (tagged `internal`, kept out of `/spec.json`)
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
- `CLOUD_SAVE_ALLOWLIST_EMAILS` — Comma-separated emails that get cloud save while the mode is not `off` (verified emails only; email/password sign-ups are unverified, so grant those with `flag:set`)
- `SERVER_IMPORTS` — `off` (default) | `on`; server-side imports into cloud saves
- `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` — purge the edge's public Cache-Tags at startup and invalidate `dxdata` on each new publication (see `src/services/edge-cache.ts`). The token needs only Zone → Cache Purge → Purge on dxrating.net

## Feature flags (cloud save, gekichumai/meta#17)

`src/services/feature-flags.ts` (`FeatureFlags`) answers `isEnabled(flag, userId)`
and caches each user's state in memory for 60 seconds. Precedence for
`cloud_save`:

1. `CLOUD_SAVE_MODE=off` is the kill switch and overrides everything.
2. A `feature_flag_overrides` row decides for its user (`enabled=false` turns one user off).
3. A verified email in `CLOUD_SAVE_ALLOWLIST_EMAILS` turns it on.
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

The cloud save migrations (`*_feature_flags`, `*_cloud_save`) and `*_tag_song_votes` only add tables
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
