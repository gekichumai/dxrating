# Search SSR Seeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/search` server-render a crawlable default chart seed list while preserving hydration correctness for users with local sort/filter state.

**Architecture:** Keep the interactive sheet list client-owned, and add a separate SSR seed section driven by route loader data. Gate the seed section with the `filterLastActiveAt` cookie and default search params, then remove it after client hydration so the normal SWR/Virtuoso list owns the live UI.

**Tech Stack:** React 19, TanStack Router/Start, Vitest, `@gekichumai/dxdata`, UnoCSS utility classes.

---

### Task 1: Search Seed Helpers

**Files:**
- Create: `apps/web/src/components/sheet/searchSeed.ts`
- Test: `apps/web/src/components/sheet/__tests__/searchSeed.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { CategoryEnum, DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  FILTER_LAST_ACTIVE_AT_COOKIE_NAME,
  buildSearchSeedSheets,
  hasActiveFilterLastActiveAtCookie,
  shouldShowSearchSeed,
} from '../searchSeed'

describe('search seed helpers', () => {
  it('sorts seed sheets by release date descending and caps at 500', () => {
    const songs = Array.from({ length: 501 }, (_, index) => ({
      songId: `song-${index}`,
      title: `Song ${index}`,
      artist: 'artist',
      genre: CategoryEnum.POPSANIME,
      bpm: '120',
      rights: '',
      imageName: '',
      searchAcronyms: [],
      sheets: [
        {
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13',
          internalLevelValue: 13,
          releaseDate: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
        },
      ],
    }))

    const seed = buildSearchSeedSheets(songs)

    expect(seed).toHaveLength(500)
    expect(seed[0]?.releaseDate).toBe('2026-05-28')
    expect(seed.every((sheet) => sheet.path.startsWith('/songs/'))).toBe(true)
  })

  it('treats missing, invalid, expired, and far-future filter cookies as inactive', () => {
    expect(hasActiveFilterLastActiveAtCookie(null, 1_000_000)).toBe(false)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=nope`, 1_000_000)).toBe(false)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=699999`, 1_000_000)).toBe(false)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=1031001`, 1_000_000)).toBe(false)
  })

  it('shows the seed only for default search without an active filter cookie', () => {
    expect(shouldShowSearchSeed({}, null, 1_000_000)).toBe(true)
    expect(shouldShowSearchSeed({ q: '宴' }, null, 1_000_000)).toBe(false)
    expect(
      shouldShowSearchSeed({}, `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=900000`, 1_000_000),
    ).toBe(true)
    expect(
      shouldShowSearchSeed({}, `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=999999`, 1_000_000),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/searchSeed.test.ts`

Expected: FAIL because `searchSeed.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create helpers that parse cookie headers, reject invalid or far-future timestamps, treat timestamps within `5 * 60 * 1000` ms as active, and flatten/sort sheets by `releaseDate` descending before slicing to 500.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/searchSeed.test.ts`

Expected: PASS.

### Task 2: Client Persistence Cookie

**Files:**
- Modify: `apps/web/src/components/sheet/SheetSortFilter.tsx`
- Test: `apps/web/src/components/sheet/__tests__/searchSeed.test.ts`

- [ ] **Step 1: Extend failing tests**

Add assertions for `serializeFilterLastActiveAtCookie()` and `serializeClearFilterLastActiveAtCookie()` so cookie strings use exactly `filterLastActiveAt`, `Max-Age=300`, `Path=/`, and `SameSite=Lax`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/searchSeed.test.ts`

Expected: FAIL because serializers do not exist.

- [ ] **Step 3: Wire persistence**

Export the TTL from the helper module, import the cookie serializers in `SheetSortFilter.tsx`, guard all `window.localStorage` access with `typeof window === 'undefined'`, set the cookie whenever persisted sort/filter data is written, and clear it when persisted local state is removed or reset.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/searchSeed.test.ts`

Expected: PASS.

### Task 3: SSR Route Seed Rendering

**Files:**
- Modify: `apps/web/src/routes/search.tsx`
- Modify: `apps/web/src/pages/SheetList.tsx`
- Create: `apps/web/src/components/sheet/SearchSeedList.tsx`
- Modify: `apps/web/src/locales/resources/en.json`
- Modify: `apps/web/src/locales/resources/ja.json`
- Modify: `apps/web/src/locales/resources/zh-Hans.json`
- Modify: `apps/web/src/locales/resources/zh-Hant.json`
- Test: `apps/web/src/components/sheet/__tests__/SearchSeedList.test.tsx`

- [ ] **Step 1: Write failing component test**

Test that `SearchSeedList` renders crawlable anchors on first render and removes itself after hydration effect.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/SearchSeedList.test.tsx`

Expected: FAIL because `SearchSeedList.tsx` does not exist.

- [ ] **Step 3: Implement route and component**

Change `/search` to `ssr: true`, add a loader that calls a `createServerFn` to inspect the request cookie, and pass `{ showSeed, seedSheets }` into `SheetList`. Render `SearchSeedList` before the interactive controls only when `showSeed` is true.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run src/components/sheet/__tests__/searchSeed.test.ts src/components/sheet/__tests__/SearchSeedList.test.tsx`

Expected: PASS.

### Task 4: Verification

**Files:**
- No new files unless fixes are required.

- [ ] **Step 1: Run web tests**

Run: `pnpm --filter @gekichumai/dxrating-web test -- --run`

Expected: PASS.

- [ ] **Step 2: Run web build**

Run: `pnpm --filter @gekichumai/dxrating-web build`

Expected: PASS with `/search` SSR-safe.

- [ ] **Step 3: Run lint and format**

Run: `pnpm lint` and `pnpm format`

Expected: PASS or formatting-only changes.

- [ ] **Step 4: Use Playwright MCP**

Start the web dev server with `pnpm --filter @gekichumai/dxrating-web dev -- --host 127.0.0.1`, navigate to `/search`, confirm seed links are present in initial HTML via `curl`, then use Playwright MCP to verify the hydrated page is usable and the seed section is gone.
