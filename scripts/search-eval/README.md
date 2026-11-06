# Search eval

Measures how well the sheet search (`apps/web/src/songs.ts`) finds the song a person means. Tracking issue:
gekichumai/meta#38.

## Files

| Path                                       | What it is                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `scripts/search-eval/generate.ts`          | Builds the eval set                                                          |
| `scripts/search-eval/kana.ts`              | Kana, romaji and sort-key helpers for the generator (not used by the app)    |
| `apps/web/src/search-eval/eval-set.json`   | The cases: `query`, `expected` song ids, `bucket`, `script`, `source`        |
| `apps/web/src/search-eval/evaluate.ts`     | Runs cases through the production search and computes the metrics           |
| `apps/web/src/search-eval/searchRecall.eval.ts` | The vitest entry: report, baseline update, regression guard             |
| `apps/web/src/search-eval/baseline.json`   | Accepted metrics per source and bucket                                       |

## Commands

```bash
pnpm --filter @gekichumai/dxrating-web search:eval          # run, guard, write apps/web/search-eval.txt
pnpm --filter @gekichumai/dxrating-web search:eval:update   # accept the current metrics as the baseline
pnpm --filter @gekichumai/search-eval generate              # rebuild eval-set.json
```

The eval is not part of `pnpm test` (it takes a few minutes). CI runs it in `.github/workflows/search-eval.yml` on PRs
that touch search or catalog code. The guard fails if any bucket's R@1, R@5, R@10 or MRR drops below the baseline.
Rebaseline only with a before/after table in the PR.

## Metrics

Results are sheets; the harness collapses them to distinct songs in result order. A case hits at rank _k_ when any
expected song is among the first _k_ songs. MRR uses the rank of the first expected song (0 when it is not returned).
Searches run against the snapshot catalog for the current version (`EVAL_VERSION`), with the snapshot's community
aliases as the server aliases, which matches what the site does.

## Sources and buckets

- **`synthetic/*`**: a fixed-seed sample of 70 titles per title script (kanji, kana, latin, mixed, symbol), plus 80
  artists. Variants per title: exact, prefix, lowercase, full width, abbreviation, typo, hiragana and katakana reading,
  reading prefix, romaji (Hepburn, Hepburn with spaces, Kunrei, short vowels, prefix), and mixed script (the first kanji
  word in hiragana, e.g. まほう仕掛けの夜).
  - Readings come from kuromoji (IPADIC). A reading is used only when its sort key matches SEGA's `title_kana` for that
    title, so wrong analyser readings never become expected behaviour. Titles without a verified reading (intl-only
    songs, analyser misses) get no reading or romaji cases.
- **`real/*`**: aggregated `?q=` strings from PostHog `$pageview` URLs (project 65078, 2026-08-09 to 2026-09-01, the only
  window where the query text was captured). No user identifiers are kept. Queries are labelled by an oracle that never
  runs the search: the first tier with a match wins (whole title/alias/reading/romaji key, then key prefix, then
  substring), and only when at most three titles match. `MANUAL_LABELS` in `generate.ts` covers typos and variants the
  oracle cannot resolve. Unlabelled queries are dropped. The raw export is not committed; pass it with
  `POSTHOG_QUERIES=<file.tsv>` (`query<TAB>hits`) to relabel, or omit it to keep the committed real cases.
  - The oracle favours queries that a substring match can resolve, so the real buckets overstate today's recall for
    reading and romaji queries; the synthetic buckets measure those.
- **`alias/exact`**: a fixed sample of 1,500 community and generated aliases, each expected to find its song.
