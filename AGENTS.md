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
- **i18n**: Paraglide JS (inlang) with 5 languages (en, ja, ko, zh-Hans, zh-Hant); messages in `apps/web/messages/<locale>.json`
- **Local DB**: sql.js (SQLite in browser) for offline song data
- **Analytics**: PostHog + Sentry

### Web SSR and Hydration
- The web app is server-rendered. SSR-visible markup must be deterministic between the server render and the first client render; do not suppress hydration warnings as a substitute for fixing the mismatch.
- Request-scoped render inputs such as locale and render time belong in TanStack Start middleware/root route context, then in shared providers such as `RenderEnvironmentProvider`. Do not call `Date.now()`, depend on the browser time zone, or read browser-only state for text that appears in the first hydrated render unless the value is seeded from the server.
- The locale is resolved per request in `apps/web/src/setup/locale.ts` (`?locale=`, then the `dxrating.locale` cookie, then Accept-Language, then `en`) and reaches React through the root route context and `LocaleProvider`. Components read it with `useLocale()` and pass it to every message call: `m.key(inputs, { locale })`. Never call a message without `{ locale }` in code that can run during SSR: a Worker isolate renders requests in different locales at once, and the implicit locale is isolate-wide state. The only exceptions are effect callbacks (they never run on the server and should read the locale when they fire) and browser-only modules listed in `src/i18n/__tests__/locale-args.test.ts`, which enforces this.
- Language switches happen in place (`useSetLocale()`, no reload). A memoized callback that formats a message must list `locale` in its dependencies (`useMemo`, `useCallback`, `useAsyncFn`), or it keeps the old language. Don't add `locale` to effect dependencies just to refresh text; that makes a language switch re-run the effect.
- For sheet release dates and other date-only values rendered in SSR, use the date helpers in `apps/web/src/utils/dateFormatting.ts`. Avoid ad hoc `new Date(...)` plus `toLocaleString()` in components, especially without an explicit `timeZone`.
- For relative times, use the rendered-at timestamp from `apps/web/src/utils/renderEnvironment.tsx` for the first render and update after mount. This preserves SSR/client parity while keeping the live UI behavior.
- After SSR-visible web changes, validate at least one non-English locale on a production build or preview and check the browser console for React hydration errors such as React #418.
- Anonymous page HTML is cached per data center for 30 minutes (`apps/web/src/setup/html-cache.ts`, wired in `apps/web/src/server.ts`), keyed by build commit, resolved locale, path and query. A page on its allowlist must render from those inputs alone: no cookies other than the locale, no user data, and no loader that fetches remote data. Otherwise, take the page off the list. Cache hits get a fresh CSP nonce; every other per-request value, such as the render time, is served as cached. The Cache API is a no-op on `workers.dev`, so PR previews never hit the cache; verify on dxrating.net.

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

- **ESM throughout** — use extensionless relative imports in bundled TypeScript code (e.g., `import { foo } from './foo'`). Backend and renderer use TypeScript's `bundler` module resolution and esbuild for Node-compatible output. Source-only packages loaded directly by Node retain explicit `.ts` extensions on runtime imports; type-only imports can be extensionless. Keep extensions for assets and actual emitted file paths.
- **Linter**: oxlint — do not add ESLint.
- **Formatter**: oxfmt — do not add Prettier.
- **Node.js 26.12.1**, pnpm 10.33.0.
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

## Fixing Sentry Issues

When asked to fix a Sentry issue, mark it resolved via the commit message ([docs](https://docs.sentry.io/product/releases/?platform=browser#resolving-issues-via-commits)). Put `Fixes <SHORT-ID>` in the commit message (or PR description), using the issue's short ID as shown in Sentry (e.g. `Fixes DXRATING-1A`). Use one `Fixes` line per issue when a commit fixes several.

Sentry then resolves the issue once the release containing the commit ships, and flags it as a regression if it reappears in a later release, so devs get notified.

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

All user-visible strings are Paraglide JS messages. Add each message to all 5 files in `apps/web/messages/` (`en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`); `src/i18n/__tests__/messages.test.ts` fails on a missing or blank translation. The Vite plugin compiles them into `apps/web/src/paraglide` (generated, not committed). Locales are configured in `apps/web/project.inlang/settings.json`.

- **Ids** are identifiers in `namespace_camelCaseKey` form, e.g. `sheet_details_title`, `ratingCalculator_io_import_lxns_success`.
- **Use**: `import { m } from '@/paraglide/messages'` and `const locale = useLocale()` (`@/i18n/LocaleProvider`), then `m.sheet_details_title({}, { locale })`. Server helpers (SEO, route `head`) take the locale they resolve.
- **Interpolation** is `{name}`. Inputs must be non-nullable: pass `value ?? ''` where a value can be missing.
- **Plurals** are variants on `count` (`"declarations": ["input count", "local countPlural = count: plural"]`, `"match": { "countPlural=one": …, "countPlural=*": … }`).
- **Rich text** uses markup (`{#link}text{/link}`), rendered with `<ParaglideMessage message={m.id} inputs={…} options={{ locale }} markup={{ link: ({ children }) => <a …>{children}</a> }} />` from `@inlang/paraglide-js-react`.
- **Never build a message id at runtime.** Map each value to its message function explicitly, so unused messages stay out of the bundle: `const LABELS = { dx: m.song_type_dx, std: m.song_type_std } satisfies Record<SheetType, PlainMessage>`, then `LABELS[type]({}, { locale })`.

## Updating Song Data

`packages/dxdata/dxdata.json` is generated — do not edit it directly. Run `scripts/annotator` to regenerate it from upstream sources.

## Deployment

- **Web** → Cloudflare Pages (auto-deployed on push to `main`)
- **Backend** → Docker container via Coolify (auto-deployed on push to `main`)
- **CI/CD** → GitHub Actions (`.github/workflows/`): `release.yml`, `backend.yml`, `preview.yml`
- CI auto-tags versions on `main` push via `release-dispatcher.yml`.

## Collaboration Rules (owner-set)

These apply to every agent and contributor. The tracking issues and the full context live in gekichumai/meta: conventions are in meta#16, and each workstream has its own issue linked from meta#10. Read the relevant issue before you start, link your PRs to it, and keep its checklist current.

### Merging
- **Default: merge, deploy, watch, then roll back or hotfix if something breaks.** Don't ask for approval on each item. This covers fixes, small changes, SEO, and docs and convention updates.
- **Exception:** the large workstreams the owner has reserved for review. These stay as PRs, stacked where needed, until the owner says go: cloud save (meta#17), bot feature parity (meta#18), photo score entry (meta#19), the iPad redesign (meta#20), competitive research (meta#22), and new features or redesigns of similar size. For these, don't merge, don't deploy, don't upload to TestFlight, and don't change production data or flip feature flags.
- For dependent PRs, use `gh stack` where it makes sense. Check it's installed first (`gh stack --help`). If it isn't, chain base branches by hand and put the order (n/N) plus prev/next links in each PR body.
- Every workstream needs an issue in gekichumai/meta. If you start something that has none, create it.

### Visuals in PRs
- Any PR that changes something visual **must embed** at least one image or video **inline in the PR body**. Use a BEFORE | AFTER table covering the relevant devices, light and dark, and locales. A link to a sheet somewhere else isn't enough.
- Host the assets on the `pr-assets` branch of gekichumai/meta (never on main) at `<repo>/<pr-number>/<file>`. meta is private, so embed `https://github.com/gekichumai/meta/blob/pr-assets/<path>?raw=true`, because `raw.githubusercontent.com` returns 404. For video, link an MP4 and also embed a GIF or a poster frame.
- Use demo or synthetic data only. Never show real user data or anyone's personal photos.

### Design
- Keep corner radii modest and consistent. Never use large ones.
- Don't use large flat solid-colour backgrounds. Use translucent material surfaces like the existing tab bar.

### Production
- Production is read-only for agents: no sign-ups and no writes to real users' data. Test with fixtures, local databases or demo accounts.
- The web CSP is enforced with per-request nonces. Don't loosen it or add third-party origins without a stated reason.
- Imported scores need provenance. Data the server fetches from the source (maimai NET, LXNS, Diving-Fish) goes straight into server storage with a provenance record, never server → client → server. A manual edit by the user strips the verified provenance. See meta#17.
