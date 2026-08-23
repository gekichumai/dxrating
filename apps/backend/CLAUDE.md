# Backend (`apps/backend`)

## Stack

- **Runtime**: Node.js 25.9.0
- **Framework**: Hono
- **API Layer**: oRPC (type-safe OpenAPI-based RPC)
- **Database**: PostgreSQL 18 via Drizzle ORM
- **Auth**: Better Auth (email/password, OAuth, passkeys)
- **Validation**: Zod
- **Error Tracking**: Sentry
- **Build**: TypeScript (`tsc`)
- **Dev**: `tsx watch`
- **Test**: Vitest
- **Lint**: oxlint

## Commands

```bash
pnpm dev          # Start dev server with hot reload
pnpm build        # TypeScript compilation
pnpm start        # Run production build
pnpm test         # Run tests (vitest)
pnpm test:migrations # Build and rehearse the compiled migration CLI, lock, journal, and backfill
pnpm lint         # Lint with oxlint
pnpm db:up        # Start local PostgreSQL (Docker)
pnpm db:down      # Stop local PostgreSQL
pnpm migrate:dev  # Apply the migration journal with the dedicated local job
pnpm migrate      # Apply migrations from the compiled production bundle
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
├── index.ts          # Entry point: Sentry init → Hono server
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

- `GET /tags` — List tags, groups, and song associations
- `POST /tags/attach` — Attach tag to song sheet (auth required)
- `POST /comments` — Create comment (auth required)
- `GET /comments` — List comments for song sheet
- `GET /aliases` — List song aliases
- `POST /aliases` — Create song alias (auth required)
- `POST /monitoring/tunnel` — Sentry error tunnel
- `POST /maimai/fetch-records` — Fetch MaimaiNET records

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
- `FRONTEND_URL` (default: http://localhost:5173)
- `ADMIN_FRONTEND_URL` (default outside production: http://localhost:5174; required in production)
- `PUBLIC_ADDITIONAL_TRUSTED_ORIGINS` (JSON array of exact, trusted public preview/development origins)
- `ADMIN_ADDITIONAL_TRUSTED_ORIGINS` (JSON array of exact, trusted administrator origins)
- `LEGACY_AUTH_COOKIE_DOMAIN` (temporary parent-domain cookie cleanup during the host-only rollout)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `SENTRY_DSN`, `SENTRY_RELEASE` — Sentry config
- `ASSETS_LOCAL_CACHE_DIR` — Local disk cache directory for oneshot renderer assets
- `ASSETS_REMOTE_URL` — Remote asset server URL (default: `https://shama.dxrating.net`)
- `VAULT_SECRET_PATH` — Optional vault secrets file
- `MIGRATION_LOCK_TIMEOUT_MS`, `MIGRATION_LOCK_RETRY_MS` — Bounded advisory-lock wait and polling interval
- `MIGRATION_CONNECTION_TIMEOUT_MS` — Dedicated migration connection timeout
- `MIGRATION_SQL_LOCK_TIMEOUT_MS`, `MIGRATION_STATEMENT_TIMEOUT_MS` — PostgreSQL safety timeouts for migration SQL

## Deployment

Deployed on Coolify with Docker Compose (`docker-compose.prod.yml`):

- Multi-stage Dockerfile (builder → runner)
- A protected, database-reachable runner executes the compiled migration entry point from the exact rehearsed image digest while the old backend remains live
- The traffic-serving `backend` never migrates on startup and is deployed only after the migration process exits successfully
- `docker-compose.prod.yml` contains no migration service or credential; `docker-compose.migrate.yml` is an explicit operator override for the same digest-pinned one-shot command
- The traffic application uses Coolify Raw Compose with native auto-deploy disabled; CI pins both the source commit and `BACKEND_IMAGE_DIGEST`, reconciles deployment interruption, then verifies `/health`, `/version`, and a database-backed read
- PostgreSQL, backend traffic, and the protected one-shot job share the stable external network named by `DATABASE_DOCKER_NETWORK`
- Traefik reverse proxy via external `coolify` network
- PostgreSQL 18 with persistent volume

Follow `docs/operations/backend-online-migrations.md` for the platform-neutral expand/backfill/validate/contract checklist, rollback boundaries, legacy-ledger reconciliation, and concurrent-index recovery. Do not bypass a failed migration job by starting the backend manually.

### Coolify Integration

When working on Coolify deployment or integration, use context7 to query the Coolify documentation:

- **Library ID**: `coollabsio/coolify-docs`
- Coolify deploys via Docker Compose with Traefik labels for routing
- CI derives the application UUID/API base from the protected deployment URL, verifies Raw Compose and disabled native auto-deploy, then triggers and polls the exact deployment

## Conventions

- API contracts defined in `contract.ts` using oRPC + Zod, implementations in `router.ts`
- Auth context passed through oRPC handler context (`context.user`)
- Database schema changes are generated with Drizzle and applied by the locked one-shot runner; never edit generated SQL or run migrations from application startup
- ES modules throughout (`.js` extensions in imports even for TypeScript)
- Credentialed CORS uses separate exact public and administrator origin lists. Public previews never receive administrator-route CORS access. Administrator previews must be listed explicitly; wildcard and substring origin matching are not supported.
