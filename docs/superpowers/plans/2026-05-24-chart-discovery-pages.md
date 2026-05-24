# Chart Discovery Pages Implementation Plan

## Goal

Replace the disappearing `/search` SSR seed list with a stable, crawler-discoverable `/charts/recent` page. Keep `/search` focused on the interactive client-side search experience, and expose the recent chart page through real links in the top tab bar, `llms.txt`, and `sitemap.xml`.

## Constraints

- Use `pnpm` only.
- Do not implement `/charts/trending` yet.
- Do not keep the cookie-based `/search` seed gating.
- `/search` must not SSR-render a block that vanishes during hydration.
- The top bar destinations must render as real `<a>` or router `<Link>` links with concrete hrefs.
- All user-visible strings must be translated in all four locale files.

## Task 1: Add Recent Chart Data Helper

Create a small helper dedicated to discovery pages instead of reusing the previous search seed helper.

Files:

- `apps/web/src/components/chartDiscovery/recentCharts.ts`
- `apps/web/src/components/chartDiscovery/__tests__/recentCharts.test.ts`

Test first:

```ts
import { describe, expect, it } from 'vitest'
import { buildRecentChartLinks, RECENT_CHART_LIMIT } from '../recentCharts'

describe('buildRecentChartLinks', () => {
  it('sorts charts by release date descending and caps the list', () => {
    const charts = buildRecentChartLinks()

    expect(charts).toHaveLength(RECENT_CHART_LIMIT)
    expect(charts[0]?.href).toMatch(/^\/songs\/[^/]+\/[^/]+\/[^/]+$/)
    expect(charts.every((chart) => chart.title.length > 0)).toBe(true)

    const timestamps = charts.map((chart) => new Date(chart.releaseDate).getTime())
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))
  })

  it('can build from an injected song list for deterministic ordering', () => {
    const charts = buildRecentChartLinks([
      {
        id: 'old-song',
        title: 'Old Song',
        artist: 'Old Artist',
        releaseDate: '2024-01-01',
        sheets: [{ type: 'dx', difficulty: 'master', level: '13+', levelValue: 13.7 }],
      },
      {
        id: 'new-song',
        title: 'New Song',
        artist: 'New Artist',
        releaseDate: '2025-01-01',
        sheets: [{ type: 'std', difficulty: 'expert', level: '12', levelValue: 12 }],
      },
    ])

    expect(charts.map((chart) => chart.songId)).toEqual(['new-song', 'old-song'])
    expect(charts.map((chart) => chart.href)).toEqual([
      '/songs/new-song/std/expert',
      '/songs/old-song/dx/master',
    ])
  })
})
```

Implementation details:

- Export `RECENT_CHART_LIMIT = 500`.
- Export `RecentChartLink` with `songId`, `sheetId`, `href`, `title`, `artist`, `type`, `difficulty`, `level`, `levelValue`, and `releaseDate`.
- Use `getSheetId(sheet)` and `songs` from `@gekichumai/dxdata`.
- Sort by parsed release date descending, then title, then sheet id for stable order.
- Keep this module free of cookie/request/header logic.

## Task 2: Build `/charts/recent`

Add a server-rendered route and semantic page component.

Files:

- `apps/web/src/pages/RecentPage.tsx`
- `apps/web/src/pages/__tests__/RecentPage.test.tsx`
- `apps/web/src/routes/charts/recent.tsx`

Test first:

```tsx
import { render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { RecentPage } from '../RecentPage'
import i18n from '../../i18n'

describe('RecentPage', () => {
  it('renders semantic chart links without client-only search controls', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <RecentPage
          charts={[
            {
              songId: 'song-a',
              sheetId: 'dx-master',
              href: '/songs/song-a/charts/dx-master',
              title: 'Song A',
              artist: 'Artist A',
              type: 'dx',
              difficulty: 'master',
              level: '13+',
              levelValue: 13.7,
              releaseDate: '2025-05-01',
            },
          ]}
        />
      </I18nextProvider>,
    )

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Song A/i })
    expect(link).toHaveAttribute('href', '/songs/song-a/charts/dx-master')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('2025-05-01').tagName.toLowerCase()).toBe('time')
  })
})
```

Implementation details:

- Page route path: `/charts/recent`.
- Individual chart links should use the app's existing canonical chart route: `/songs/:songId/:type/:difficulty`.
- Route should use `ssr: true`.
- Route loader returns `buildRecentChartLinks()`.
- Page renders one `h1`, a short translated description, and an ordered/list structure of real anchors.
- Use `time dateTime={releaseDate}`.
- Use compact but readable styling; this is a utility page, not a marketing page.
- Reuse existing SEO helpers in route `head`.

## Task 3: Remove `/search` Seed and Cookie Path

Delete the current SSR seed behavior and cookie utilities completely.

Files:

- `apps/web/src/routes/search.tsx`
- `apps/web/src/components/sheet/SheetList.tsx`
- `apps/web/src/components/sheet/SheetSortFilter.tsx`
- delete `apps/web/src/components/sheet/SearchSeedList.tsx`
- delete `apps/web/src/components/sheet/searchSeed.ts`
- delete old search seed tests
- `apps/web/package.json`
- `pnpm-lock.yaml`

Implementation details:

- Restore `/search` to a client-only route unless another existing requirement requires SSR.
- Remove `createServerFn`, `getRequestHeader`, `hasActiveFilterLastActiveAtCookie`, and `shouldShowSearchSeed`.
- Remove `SearchSeedList` rendering from `SheetList`.
- Keep local filter persistence via localStorage only.
- Keep `SHEET_SORT_FILTER_TTL` as a local constant in `SheetSortFilter.tsx`.
- Remove the direct `cookie` package dependency from the web app only if no remaining code imports it; keep it if another SSR path still uses it.

Regression checks:

```bash
rg "SearchSeed|searchSeed|filterLastActiveAt|FILTER_LAST_ACTIVE|cookie" apps/web/src apps/web/package.json
```

The only allowed result should be unrelated text, if any.

## Task 4: Add Discoverable Top Bar Links

Update the root tab bar so `Search Charts`, `My Rating`, and the new recent icon are crawlable links.

File:

- `apps/web/src/routes/__root.tsx`

Implementation details:

- Add a left-side icon-only link to `/charts/recent`.
- Use a real `href="/charts/recent"` and an accessible translated label.
- Convert the existing `Tab` elements to render concrete links, either router `Link` or anchor-backed MUI tabs.
- Preserve the current visual density and view transition behavior where practical.
- Keep `/songs/*` and `/privacy-policy` behavior unchanged.

Validation:

- SSR/preview HTML must include `href="/charts/recent"`, `href="/search"`, and `href="/rating"` in the top bar.
- Browser navigation should still work normally.

## Task 5: Add Discovery Metadata

Update machine-readable discovery files.

Files:

- `apps/web/src/routes/llms[.]txt.ts`
- `apps/web/src/routes/sitemap[.]xml.ts`
- related tests if present, or add narrow tests alongside routes

Implementation details:

- Add `/charts/recent` to `llms.txt` as the canonical recent chart discovery page.
- Adjust the guidance so `/search` is described as interactive search and `/charts/recent` as crawlable discovery.
- Add `/charts/recent` as a static URL in `sitemap.xml`.

## Task 6: Translate UI Text

Files:

- `apps/web/src/locales/en.json`
- `apps/web/src/locales/ja.json`
- `apps/web/src/locales/zh-Hans.json`
- `apps/web/src/locales/zh-Hant.json`

Keys:

- `root:pages.recent.title`
- `root:pages.recent.seo-title`
- `root:pages.recent.seo-description`
- `root:pages.recent.icon-label`
- `sheet:chart-discovery.recent.title`
- `sheet:chart-discovery.recent.description`
- `sheet:chart-discovery.recent.count`
- `sheet:chart-discovery.level`
- `sheet:chart-discovery.updated`

Remove obsolete `sheet:search-seed.*` keys.

## Task 7: Verification and Delivery

Run focused tests first, then broad checks:

```bash
pnpm --filter @gekichumai/dxrating-web exec vitest run apps/web/src/components/chartDiscovery/__tests__/recentCharts.test.ts apps/web/src/pages/__tests__/RecentPage.test.tsx
pnpm --filter @gekichumai/dxrating-web test
pnpm --filter @gekichumai/dxrating-web build
pnpm lint
pnpm format:check
```

Local preview checks:

```bash
pnpm --filter @gekichumai/dxrating-web exec vite --host 0.0.0.0
curl -s http://localhost:5173/charts/recent | rg 'href="/songs/[^"]+/[^"]+/[^"]+"' | wc -l
curl -s http://localhost:5173/search | rg 'search-seed|Recently updated charts|href="/songs/[^"]+/[^"]+/[^"]+"'
curl -s http://localhost:5173/charts/recent | rg 'href="/charts/recent"|href="/search"|href="/rating"'
```

Expected:

- `/charts/recent` returns 500 chart links.
- `/search` does not include the old seed block or bulk chart links.
- Top bar links are present as real hrefs.

Then commit, push, update the existing PR, wait for the Cloudflare Pages preview comment, and validate the deployed preview with the same curl/browser checks.
