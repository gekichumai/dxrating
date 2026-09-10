# Search opportunity implementation

## Changes

- `/search`: localized maimai heading, description, calculator/recent/trending links, and ten catalog-backed song links on the empty-query landing page.
- `/rating`: server-rendered Best 50 introduction and import/calculation/export guide; the interactive calculator stays behind a client boundary.
- Song pages: compact BPM, chart constant, selected version and availability facts; clearer maimai titles; crawlable chart tabs that preserve locale and modified-click behavior.
- Five supported languages: self-canonical URLs, matching Open Graph URLs and reciprocal HTML hreflang links. Search filters canonicalize to the localized search landing page.
- Sitemap: canonical URLs for all five locales, excluding the redirecting homepage. HTML owns hreflang relationships; they are not duplicated in XML. These methods are equivalent under [Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

## Measurement after deployment

Record the actual deployment date before interpreting results. Compare complete, matched 28-day search-performance windows before and after deployment, leaving time for recrawling. Keep query, page, device and country segments consistent; aggregate difficulty and locale variants into cohorts as well as inspecting individual URLs. Do not treat multiple URLs for a query as proof of cannibalization.

Use this query set for comparison or keyword rank tracking:

| Cohort | Queries | Intended destination |
| --- | --- | --- |
| Chart search | maimai charts; maimai chart; maimai song search | `/search` |
| Calculator | maimai rating calculator; maimai rating; maimai rating 計算 | `/rating` |
| Best 50 | maimai b50; maimai b50 查詢 | `/rating` |
| Song details | latent kingdom; クロノイデア; 終焉逃避行 bpm; 7 wonders maimai; regulus maimai; sky trails maimai; 雨露霜雪 | Corresponding song chart pages |

Check clicks, impressions, CTR and average position alongside existing organic-arrival import/calculator/export completion events. Inspect Google-selected canonicals for English, Japanese and Traditional Chinese search/rating/song samples. Run a site crawl after deployment to validate production rendering, canonical targets and internal links.

No deployment or external monitoring configuration is performed by this code change.
