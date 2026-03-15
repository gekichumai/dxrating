# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DXRating is a web application for maimai DX (music arcade game) providing rating calculators, song data, and community features (tags, comments, aliases). It is a Turborepo monorepo.

## Commands

**Always use pnpm, never npm/yarn/npx.**

### Root (all apps)
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
pnpm --filter @gekichumai/backend dev          # Hono dev server (port 3000)
pnpm --filter @gekichumai/backend test         # Run all integration tests
pnpm --filter @gekichumai/backend test:watch   # Watch mode
pnpm --filter @gekichumai/backend db:up        # Start PostgreSQL via Docker
pnpm --filter @gekichumai/backend db:down      # Stop PostgreSQL
```

### Web (`apps/web`)
```bash
pnpm --filter @gekichumai/dxrating-web dev     # Vite dev server (port 5173)
pnpm --filter @gekichumai/dxrating-web build   # TypeScript + Vite build
pnpm --filter @gekichumai/dxrating-web test    # Vitest
```

### Running a single test
```bash
cd apps/backend && pnpm vitest run src/test/auth.test.ts    # Single backend test file
cd apps/web && pnpm vitest run path/to/test.ts              # Single web test file
```

## Architecture

```
apps/
├── web/          React 19 + Vite SPA (UnoCSS, MUI, wouter routing, TanStack Query)
├── backend/      Hono API server (oRPC, Drizzle ORM, PostgreSQL, Better Auth)
└── functions/    Cloudflare Workers (mirrors some backend endpoints for edge)

packages/
├── dxdata/       Pre-annotated maimai DX song metadata (large JSON + TypeScript enums)
└── tsconfig/     Shared TypeScript base config
```

### Web → Backend Communication
- Type-safe API via **oRPC**: contracts defined in `apps/backend/src/contract.ts`, implementations in `apps/backend/src/router.ts`
- Web uses `@orpc/client` + `@orpc/tanstack-query` to call backend
- Auth via **Better Auth** cookies (prefix: `dxrating_`)

### Backend Key Paths
- `src/index.ts` — Entry point (Sentry init, server start)
- `src/app.ts` — Hono app setup (routes, CORS, error handling)
- `src/contract.ts` — oRPC API contracts with Zod validation
- `src/router.ts` — oRPC route handler implementations
- `src/auth.ts` — Better Auth config (email/password, Google/GitHub OAuth, passkeys)
- `src/db/schema.ts` — Drizzle app tables (tags, comments, profiles, song_aliases)
- `src/db/auth-schema.ts` — Better Auth tables
- `src/services/functions/` — Oneshot renderer, MaimaiNET scraper, LXNS integration

### Web Key Patterns
- **Styling**: UnoCSS (Tailwind-compatible) + MUI 5 + shadcn/ui via Radix primitives
- **i18n**: i18next with 4 languages (en, ja, zh-Hans, zh-Hant)
- **Local DB**: sql.js (SQLite in browser) for offline song data
- **Analytics**: PostHog + Sentry

## Conventions

- **ESM throughout** — use `.js` extensions in TypeScript imports
- **Linter/Formatter**: oxlint + oxfmt (Rust-based, not ESLint/Prettier)
- **Node.js v25**, pnpm 10.30.3
- **Database migrations**: Drizzle Kit (`drizzle-kit`) — migration files in `apps/backend/drizzle/`
- **Auth context** in oRPC handlers via `context.user`
- Backend tests are integration tests requiring a running PostgreSQL (`pnpm db:up` first, or CI uses a service container)
- CI auto-tags versions on main push and deploys: web → Cloudflare Pages, backend → Docker → Coolify

## Environment Setup

Backend requires `.env.local` in `apps/backend/` (copy from `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string (default: `postgres://postgres:postgres@localhost:5432/dxrating`)
- `BETTER_AUTH_SECRET` — Auth secret key

Web uses `apps/web/.env` with `VITE_BACKEND_URL` and `VITE_BETTER_AUTH_URL` (default to `http://localhost:3000`).
