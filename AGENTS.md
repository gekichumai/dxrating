# AGENTS.md

Agent guidance for the DXRating monorepo. Read this before making changes.

## Project

DXRating is a Turborepo monorepo for a maimai DX rating calculator and community platform (rating calculators, song data, tags, comments, aliases).

```
apps/
├── web/          React 19 + Vite SPA (UnoCSS, MUI, wouter routing, TanStack Query)
├── backend/      Hono API server (oRPC, Drizzle ORM, PostgreSQL, Better Auth)
└── functions/    Cloudflare Workers (edge endpoints)

packages/
├── dxdata/       Pre-annotated maimai DX song/sheet metadata (large JSON + TypeScript enums)
└── tsconfig/     Shared TypeScript base config

scripts/
└── annotator/    Generates packages/dxdata/dxdata.json from upstream sources
```

## Package Manager

**Always use `pnpm`. Never use `npm`, `yarn`, or `npx`.**

## Commands

### Root
```bash
pnpm install              # Install dependencies
pnpm build                # Build all apps/packages (via Turbo)
pnpm dev                  # Start all dev servers
pnpm lint                 # Lint with oxlint
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format with oxfmt
pnpm format:check         # Check formatting
```

### Backend (`apps/backend`)
```bash
pnpm --filter @gekichumai/backend dev          # Hono dev server — port 3000
pnpm --filter @gekichumai/backend test         # Integration tests (requires PostgreSQL — run db:up first)
pnpm --filter @gekichumai/backend test:watch   # Watch mode
pnpm --filter @gekichumai/backend db:up        # Start PostgreSQL via Docker
pnpm --filter @gekichumai/backend db:down      # Stop PostgreSQL
```

### Web (`apps/web`)
```bash
pnpm --filter @gekichumai/dxrating-web dev     # Vite dev server — port 5173
pnpm --filter @gekichumai/dxrating-web build   # TypeScript + Vite build
pnpm --filter @gekichumai/dxrating-web test    # Vitest
```

### Single test file
```bash
cd apps/backend && pnpm vitest run src/test/auth.test.ts
cd apps/web && pnpm vitest run path/to/test.ts
```

## Environment Setup

Backend requires `apps/backend/.env.local` (copy from `apps/backend/.env.example`):
- `DATABASE_URL` — default: `postgres://postgres:postgres@localhost:5432/dxrating`
- `BETTER_AUTH_SECRET` — any secret string for local dev
- `BETTER_AUTH_URL` — default: `http://localhost:3000`
- `FRONTEND_URL` — default: `http://localhost:5173`
- OAuth and Turnstile keys are optional for local dev

Web requires `apps/web/.env` (no `.env.example` — create manually):
- `VITE_BACKEND_URL=http://localhost:3000`
- `VITE_BETTER_AUTH_URL=http://localhost:3000`

## Architecture

### Backend Key Paths
- `src/index.ts` — Entry point (Sentry init, server start)
- `src/app.ts` — Hono app setup (routes, CORS, error handling)
- `src/contract.ts` — oRPC API contracts with Zod validation
- `src/router.ts` — oRPC route handler implementations
- `src/auth.ts` — Better Auth config (email/password, Google/GitHub OAuth, passkeys)
- `src/db/schema.ts` — Drizzle app tables (tags, comments, profiles, song_aliases)
- `src/db/auth-schema.ts` — Better Auth tables
- `src/services/functions/` — Oneshot renderer, MaimaiNET scraper

### Web Key Patterns
- **Styling**: UnoCSS (Tailwind-compatible utility classes) + MUI 5 + shadcn/ui via Radix primitives
- **i18n**: i18next with 4 languages (en, ja, zh-Hans, zh-Hant)
- **Local DB**: sql.js (SQLite in browser) for offline song data
- **Analytics**: PostHog + Sentry

### API Layer
- Contracts are defined with Zod in `apps/backend/src/contract.ts` and **mirrored** in `apps/web/src/lib/contract.ts` — both files must stay in sync.
- The web client uses `@orpc/openapi-client` + `@orpc/tanstack-query` to call the backend.
- Do not add raw `fetch` calls in the web app — use the `orpc` utility from `apps/web/src/lib/orpc.ts`.

### Auth
- Better Auth handles sessions via cookies prefixed `dxrating_`.
- In oRPC handlers, access the current user via `context.user` (typed as `Context` in `router.ts`).
- Throw `new Error('Unauthorized')` for unauthenticated access to protected routes.

### Database
- Drizzle ORM with PostgreSQL 16.
- Schema: `apps/backend/src/db/schema.ts` (app tables), `apps/backend/src/db/auth-schema.ts` (Better Auth tables).
- Migrations live in `apps/backend/drizzle/`. Generate with `drizzle-kit generate`, apply with `drizzle-kit migrate`.
- Never hand-edit generated migration SQL files.

### Caching
- `apps/backend/src/router.ts` uses an in-memory Keyv cache (30-minute TTL).
- Mutations that affect cached data must call `await cache.delete('<key>')` after the write.
- Current cached keys: `tags:list`.

## Code Conventions

- **ESM throughout** — use `.js` extensions in TypeScript imports (e.g., `import { foo } from './foo.js'`). Applies to `apps/backend` and `packages/`.
- **Linter**: oxlint — do not add ESLint.
- **Formatter**: oxfmt — do not add Prettier.
- **Node.js v25**, pnpm 10.30.3.
- TypeScript strict mode is enabled across all packages.

## Testing

- Backend tests are integration tests. Run `pnpm --filter @gekichumai/backend db:up` **before** running tests locally. CI provides a PostgreSQL service container automatically.
- Web tests use Vitest and do not require external services.
- Test files: `apps/backend/src/test/`, alongside source files in `apps/web/src/`.

## Before Committing

```bash
pnpm lint        # must pass
pnpm format      # must pass
pnpm build       # verify no TypeScript errors
```

## Adding a New API Endpoint

1. Add the contract (input/output Zod schemas + route definition) to `apps/backend/src/contract.ts`.
2. Mirror the contract in `apps/web/src/lib/contract.ts`.
3. Implement the handler in `apps/backend/src/router.ts`.
4. Use `orpc.<route>.useQuery()` or `orpc.<route>.useMutation()` in the web app — never raw `fetch`.
5. Add an integration test in `apps/backend/src/test/`.

## Adding a Database Table

1. Add the table definition to `apps/backend/src/db/schema.ts`.
2. Run `cd apps/backend && pnpm drizzle-kit generate` to create a migration file.
3. Apply with `pnpm drizzle-kit migrate` (or restart the dev server — it auto-migrates on startup).
4. Export the new table from `schema.ts` and import it in `router.ts` as needed.

## Adding UI Text (i18n)

All user-visible strings must use `useTranslation()` from `react-i18next`. Add translation keys to all 4 locale files under `apps/web/src/locales/`: `en`, `ja`, `zh-Hans`, `zh-Hant`.

## Updating Song Data

`packages/dxdata/dxdata.json` is generated — do not edit it directly. Run `scripts/annotator` to regenerate it from upstream sources.

## Deployment

- **Web** → Cloudflare Pages (auto-deployed on push to `main`)
- **Backend** → Docker container via Coolify (auto-deployed on push to `main`)
- **CI/CD** → GitHub Actions (`.github/workflows/`): `release.yml`, `backend.yml`, `preview.yml`
- CI auto-tags versions on `main` push via `release-dispatcher.yml`.
