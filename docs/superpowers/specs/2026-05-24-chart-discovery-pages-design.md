# Chart Discovery Pages Design

Status: approved for design by the user on 2026-05-24.

## Context

The current PR makes `/search` expose chart links to crawlers by rendering a "Recently updated charts" seed list during SSR and removing it after hydration. That approach meets the discovery goal, but it creates a visible flash before CSR hydration and can hurt user-facing metrics such as LCP.

The real goal is broader than `/search`: LLMs and crawlers need a reliable way to discover useful chart URLs. `/search` does not need to contain hundreds of chart links itself.

## Goals

- Replace the disappearing `/search` seed list with a stable dedicated chart discovery page.
- Add `/charts/recent` as an SSR page that permanently renders recently updated chart links.
- Keep `/search` focused on the interactive search UI, with only a small persistent link to `/charts/recent`.
- Update machine-readable discovery surfaces so crawlers and LLM fetchers can find `/charts/recent`.
- Keep the shape extensible for a later `/charts/trending` page without implementing trending now.

## Non-Goals

- Do not implement `/charts/trending` in this change.
- Do not render hundreds of chart links directly on `/search`.
- Do not keep content that appears only before hydration and disappears after hydration.
- Do not add pagination for `/charts/recent`.
- Do not change the interactive filtering, sorting, or local storage behavior of `/search` beyond removing the seed-list workaround.

## Architecture

### `/charts/recent`

`/charts/recent` is a normal SSR route whose primary content is a crawlable list of chart links.

Route behavior:

- URL: `/charts/recent`
- SSR: enabled
- Page title: `Recently Updated Charts - DXRating`
- Heading: `Recently Updated Charts`
- Content: top 500 chart links sorted by release date descending
- Each chart entry includes:
  - song title
  - chart type
  - difficulty
  - level
  - release date when available
  - canonical chart link from `buildSheetPath`

The page is real content, not a hydration-only scaffold. The list remains in the DOM after hydration.

### `/search`

`/search` returns to being the interactive search surface.

Remove:

- the route loader seed data;
- `SearchSeedList`;
- the filter activity cookie used only to suppress the seed list;
- tests that assert the pre-hydration seed block disappears.

Keep or add:

- a small persistent link to `/charts/recent` with the text "Browse recently updated charts";
- the existing search input, filters, summary, and virtualized chart list behavior.

The link is useful to users, not hidden or crawler-only. It lives near the search/filter controls where it does not compete with the main task.

### Shared Discovery List Shape

Create or rename helpers away from "search seed" terminology. Use this shape:

- `apps/web/src/components/chartDiscovery/recentCharts.ts`
- `RECENT_CHART_LIMIT = 500`
- `buildRecentCharts(songs = dxdata.songs)`
- `RecentChart` type with song/chart metadata and `path`

The helper is independent of `/search`. That keeps the model clean and leaves room for a future `/charts/trending` data source to reuse the page/list component.

### Discovery Surfaces

Update machine-readable discovery entry points:

- Add `/charts/recent` to `llms.txt`.
- Add `/charts/recent` to `sitemap.xml` as a static route.

Do not change `robots.txt`. Robots can continue allowing the site generally.

## Data Flow

1. `/charts/recent` loader or page code builds the recent chart list from `dxdata.songs`.
2. The helper flattens songs into chart entries, sorts by `releaseDate` descending, and returns the first 500.
3. The SSR page renders semantic HTML links to canonical chart URLs.
4. Crawlers discover `/charts/recent` via normal links, `llms.txt`, and sitemap.
5. Users reaching `/search` can navigate to `/charts/recent` through a small persistent link.

## Error Handling

- Missing release dates sort after dated charts.
- Invalid release dates do not crash rendering; treat them as undated.
- If no charts are available, show an empty-state message and keep the page title/heading.
- Chart paths must remain encoded through `buildSheetPath`, not hand-built strings.

## SEO And Accessibility

- Use one `h1` on `/charts/recent`.
- Render chart links as real `<a href="/songs/...">` anchors.
- Use a semantic list (`ol` or `ul`) for chart entries.
- Include `time dateTime="YYYY-MM-DD"` when a release date exists.
- Add locale strings for visible text in all four locale files.
- Avoid hidden crawler-only text.

## Testing

Unit tests cover:

- recent chart helper sorting and 500-entry cap;
- undated or invalid release date fallback;
- route/page rendering includes crawlable chart anchors;
- `/search` no longer renders disappearing seed content;
- `llms.txt` includes `/charts/recent`;
- sitemap includes `/charts/recent`.

Build verification includes:

- `pnpm --filter @gekichumai/dxrating-web exec vitest run`
- `pnpm --filter @gekichumai/dxrating-web build`
- `pnpm lint`
- `pnpm format:check`

Preview verification includes:

- `curl` on `/charts/recent` confirms 500 chart links.
- `curl` on `/search` confirms no seed list markup.
- Browser hydration check confirms `/search` does not flash a disappearing chart block.

## Migration From Current PR

The current PR already has useful pieces, but they need reshaping:

- Keep the chart flattening/sorting logic, renamed for recent chart discovery.
- Keep canonical path generation through `buildSheetPath`.
- Drop the `/search` seed loader and `SearchSeedList`.
- Drop the `filterLastActiveAt` cookie machinery.
- Rework tests to validate stable `/charts/recent` content instead of pre-hydration-only content.

## Future Extension

`/charts/trending` can later reuse the same page/list presentation with a different data source, such as top-viewed chart data.

This spec intentionally leaves trending out. The only design accommodation now is naming and component boundaries that do not hard-code everything to "recent" when a generic chart discovery list would be clearer.
