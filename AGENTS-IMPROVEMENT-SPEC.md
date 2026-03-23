# AGENTS.md Improvement Spec

Analysis of the existing agent guidance files and a concrete spec for improvements.

---

## Source Files Reviewed

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Primary agent guidance (Claude Code) |
| `AGENTS.md` | Created in this session — general agent guidance |
| `.ona/review/comments.json` | Ona review state (empty) |
| `README.md` | User-facing project documentation |

No `.cursor/rules/` or `.ona/skills/` files exist in this repo.

---

## What's Good

### CLAUDE.md
- Commands are complete and accurate, including filter-scoped pnpm commands and single-test invocations.
- Architecture section correctly identifies all key source files with their roles.
- Conventions section covers the non-obvious choices (ESM `.js` extensions, oxlint/oxfmt instead of ESLint/Prettier, Node.js version).
- Environment setup section lists all required env vars with defaults.
- Auth pattern (`context.user`) is documented.

### README.md
- Tech stack table is accurate and scannable.
- Getting-started steps are correct and complete.
- Deployment targets are documented.

---

## What's Missing

### 1. No AGENTS.md existed
The repo had `CLAUDE.md` (Claude Code-specific) but no general `AGENTS.md` for other agents (Ona, Cursor, Copilot, etc.). Created in this session.

### 2. No guidance on adding API endpoints or database tables
`CLAUDE.md` describes the architecture but gives no step-by-step workflow for the two most common tasks agents perform: adding a new endpoint and adding a new DB table. Agents must infer the pattern from reading multiple files.

### 3. No guidance on the web ↔ backend contract duplication
The contract is defined in `apps/backend/src/contract.ts` **and** mirrored in `apps/web/src/lib/contract.ts`. This is a non-obvious pattern. Agents that only update one side will introduce type drift. Neither file documents this relationship.

### 4. No guidance on i18n requirements
All user-visible strings require entries in 4 locale files. This is easy to miss. No agent guidance mentions it.

### 5. No guidance on the `orpc` client pattern
The web app uses `orpc.<route>.useQuery()` / `useMutation()` from `apps/web/src/lib/orpc.ts`. Agents unfamiliar with oRPC will reach for raw `fetch` or `axios`. Not documented.

### 6. No guidance on Drizzle migration workflow
The migration workflow (generate → apply) is not documented. Agents may edit migration SQL directly (wrong) or forget to generate a migration after schema changes.

### 7. No guidance on the `scripts/annotator`
The annotator generates `packages/dxdata/dxdata.json`. Agents asked to update song data need to know this exists and how to run it. Not documented anywhere in agent guidance files.

### 8. devcontainer is under-configured
`devcontainer.json` uses the 10 GB universal image with no features, no port forwarding, no post-create commands, and no env file setup. Agents starting a fresh environment must manually run `db:up`, copy `.env.example`, and install dependencies.

### 9. No guidance on the `functions` app
`apps/functions` (Cloudflare Workers) is mentioned in the architecture diagram but has no guidance on when to add endpoints there vs. the main backend, or how to develop/test it.

### 10. No guidance on cache invalidation in the backend
`apps/backend/src/router.ts` uses an in-memory Keyv cache (30-minute TTL) for the tags list. Agents adding mutations that affect cached data need to know to call `cache.delete(key)`. Not documented.

---

## What's Wrong

### 1. CLAUDE.md omits `scripts/annotator` from the architecture diagram
The README shows `scripts/annotator` in the tree; CLAUDE.md does not. Agents reading only CLAUDE.md will not know it exists.

### 2. CLAUDE.md says "Backend tests are integration tests requiring a running PostgreSQL"
This is correct but incomplete: it does not say that `db:up` must be run **before** `test`, only that it is required. Agents may run tests and get confusing connection errors.

### 3. CLAUDE.md does not mention the `apps/web/.env` file needs to be created
It documents the variables but not that the file must be created (there is no `.env.example` for web). Agents setting up the web app may miss this.

### 4. devcontainer uses Node.js 24 image comment but project requires Node.js 25
The devcontainer comment suggests `mcr.microsoft.com/devcontainers/javascript-node:24` as a lighter alternative, but the project requires Node.js 25 (`.node-version` file). This is misleading.

---

## Improvement Spec

### S1 — Add workflow recipes to AGENTS.md (high value)

Add two step-by-step recipes:

**"Adding a new API endpoint"**
1. Add contract (Zod schemas + route) to `apps/backend/src/contract.ts`
2. Mirror the contract in `apps/web/src/lib/contract.ts` — these two files must stay in sync
3. Implement the handler in `apps/backend/src/router.ts`
4. Use `orpc.<route>.useQuery()` or `useMutation()` in the web app (never raw fetch)
5. Add an integration test in `apps/backend/src/test/`

**"Adding a database table"**
1. Add table definition to `apps/backend/src/db/schema.ts`
2. Run `cd apps/backend && pnpm drizzle-kit generate`
3. Apply with `pnpm drizzle-kit migrate` (or restart dev server — it auto-migrates)
4. Never hand-edit generated SQL migration files

### S2 — Document i18n requirement in AGENTS.md (high value)

Add a rule: all user-visible strings must use `useTranslation()` and have entries in all 4 locale files under `apps/web/src/locales/`. Agents must add keys to `en.json`, `ja.json`, `zh-Hans.json`, and `zh-Hant.json` when adding UI text.

### S3 — Document cache invalidation pattern in AGENTS.md (medium value)

Add a note: the backend uses an in-memory Keyv cache in `router.ts`. Mutations that affect cached data must call `await cache.delete('<key>')` after the write. Current cached keys: `tags:list`.

### S4 — Document the `scripts/annotator` in AGENTS.md (medium value)

Add a section explaining that `packages/dxdata/dxdata.json` is generated by `scripts/annotator`, not hand-edited. Include the command to regenerate it when upstream song data changes.

### S5 — Fix CLAUDE.md: add `scripts/annotator` to architecture tree (low effort)

Add `scripts/annotator` to the architecture diagram in CLAUDE.md to match README.md.

### S6 — Fix CLAUDE.md: clarify test prerequisite order (low effort)

Change the backend test note to explicitly state: run `pnpm db:up` **before** `pnpm test`. The current wording implies it is optional.

### S7 — Fix CLAUDE.md: document web `.env` file creation (low effort)

Add a note that `apps/web/.env` must be created manually (no `.env.example` exists for web) with `VITE_BACKEND_URL=http://localhost:3000` and `VITE_BETTER_AUTH_URL=http://localhost:3000`.

### S8 — Improve devcontainer.json (medium value)

Replace the universal image with a Node.js 25-specific image. Add:
- `postCreateCommand` to run `pnpm install && pnpm --filter @gekichumai/backend db:up`
- `forwardPorts: [3000, 5173]` for backend and web dev servers
- A note or feature for Docker-in-Docker (needed for `db:up`)
- Fix the misleading Node.js 24 comment

### S9 — Add `apps/functions` guidance to AGENTS.md (low value, low effort)

Add a brief note: `apps/functions` mirrors select backend endpoints as Cloudflare Workers for lower latency. Add endpoints there only when latency is the explicit goal; otherwise add to the main backend. Test with `wrangler dev`.

### S10 — Add a "Before committing" checklist to AGENTS.md (low effort)

```
pnpm lint        # must pass
pnpm format      # must pass
pnpm build       # verify no TypeScript errors
```

---

## Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | S1 — Workflow recipes | Medium |
| 2 | S2 — i18n requirement | Low |
| 3 | S8 — devcontainer improvements | Medium |
| 4 | S3 — Cache invalidation | Low |
| 5 | S6 — Test prerequisite fix | Low |
| 6 | S7 — Web .env creation | Low |
| 7 | S4 — scripts/annotator docs | Low |
| 8 | S5 — CLAUDE.md architecture tree | Low |
| 9 | S10 — Pre-commit checklist | Low |
| 10 | S9 — functions app guidance | Low |
