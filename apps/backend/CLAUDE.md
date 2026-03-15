# Backend (`apps/backend`)

## Stack

- **Runtime**: Node.js 25
- **Framework**: Hono
- **API Layer**: oRPC (type-safe OpenAPI-based RPC)
- **Database**: PostgreSQL 16 via Drizzle ORM
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
pnpm lint         # Lint with oxlint
pnpm db:up        # Start local PostgreSQL (Docker)
pnpm db:down      # Stop local PostgreSQL
```

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
│   └── functions/    # Oneshot renderer, fetch-net-records, LXNS data
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
- `GET /lxns/player` — Get LXNS player data
- `GET /lxns/scores` — Get LXNS player scores

### Direct Routes

- `GET /health` — Health check
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
- CORS allows `localhost` for dev and `https://dxrating.net` for production