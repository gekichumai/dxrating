# Backend (`apps/backend`)

## Stack

- **Runtime**: Node.js 25.9.0
- **Application**: Effect 3 services, layers, typed failures, and scoped resources
- **HTTP adapter**: Hono
- **API Layer**: oRPC (type-safe OpenAPI-based RPC)
- **Database**: PostgreSQL 16 via Drizzle ORM
- **Auth**: Better Auth (email/password, OAuth, passkeys)
- **Validation**: Zod
- **Error Tracking**: Sentry
- **Build**: Effect diagnostics + TypeScript checking + esbuild production bundle
- **Dev**: `tsx watch`
- **Test**: Vitest
- **Lint**: oxlint + official Effect language-service diagnostics (errors)

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
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_B64`, `APPLE_APP_BUNDLE_IDENTIFIER` — Sign in with Apple; the backend derives short-lived client-secret JWTs from the base64-encoded `.p8` key
- `SENTRY_DSN`, `SENTRY_RELEASE` — Sentry config
- `ASSETS_LOCAL_CACHE_DIR` — Local disk cache directory for oneshot renderer assets
- `ASSETS_REMOTE_URL` — Remote asset server URL (default: `https://shama.dxrating.net`)
- `VAULT_SECRET_PATH` — Optional vault secrets file

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
- Database schema changes go through Drizzle migrations (`drizzle-kit`)
- ES modules throughout (`.js` extensions in imports even for TypeScript)
- CORS allows `localhost` for dev, `https://dxrating.net` for production, and `*.dxrating.pages.dev` for preview deployments


## Effect conventions

Application operations return `Effect<A, E, R>` and compose with `Effect.gen`,
`Effect.fn`, and the standard combinators. Keep shared API contracts in Zod so
Hono/oRPC clients retain the existing wire format. Pure parsing, calculations,
and JSX construction stay ordinary pure functions.

Use `Context.Tag` services and compose their live `Layer`s in `runtime.ts`.
Provide test services at the test entry point. Model recoverable failures with
specific tagged errors; retain the foreign failure in `cause`. Adapt individual
foreign operations with `Effect.tryPromise` or `Effect.try`, without generic
Promise wrappers, `unknown` error channels, or converting defects into expected
failures. Use `Effect.acquireRelease` and scopes for resource ownership.

Only Hono/oRPC handlers, Better Auth callbacks, renderer SDK callbacks, test
runners, and executable entry points convert Effects to Promises. The HTTP
boundary uses `runApp`, whose managed runtime preserves expected error identity
using `Effect.either` and `Either.getOrThrowWith`. Defects and interruptions retain
Effect's runtime failure semantics. Do not recursively unwrap or squash causes.

Shutdown closes the listener, interrupts and joins in-flight application work,
and then disposes service layers. PostgreSQL and Better Auth do not support
AbortSignal cancellation: keep their promises tracked until they settle. OAuth
token exchange/rotation must persist issued credentials even if the caller
cancels. Database transactions roll back on failure, defect, or interruption,
and discard connections after failed commit/cleanup.

`pnpm lint:effect` runs the official language-service CLI against all backend
TypeScript, including tests and operator scripts. The `diagnosticSeverity` map
in `tsconfig.json` makes correctness and unsafe-pattern rules errors. Both
backend build and root/backend lint run it; no editor-only plugin or patched
compiler is required. Do not disable a rule to hide an application error. The
single `strictEffectProvide` exception at the moderation CLI documents a real
application entry point; the upstream rule flags all layer provision calls.
