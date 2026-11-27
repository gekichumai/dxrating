# Web catalog alignment: remaining glossary exceptions

Scope: apps/web/messages/*.json.
glossary_check.py (gekichumai/dxrating-ios `scripts/l10n/`) reports 67 hits after alignment (against the current glossary). The checker's flatten step skips plural variants, so a separate check that includes them was also run. Every remaining hit is listed below with its reason. Format: concept | term | keys | reason.

## Cross-locale
- song_seo_title | {level} missing in ja, ko, zh-Hans, zh-Hant | song_seo_title | Left unchanged on purpose. apps/web/src/utils/seo.ts renders it as the chart page <title>; #406 chose CJK titles that show only the internal level (譜面定数14.7), and apps/web/src/i18n/__tests__/messages.test.ts records this in DROPPED_ON_PURPOSE. To add it anyway, use e.g. ja "{title} {sheetLabel} Lv.{level} 譜面定数{constant} | …", and drop the DROPPED_ON_PURPOSE entry.
- game.server | picker without 版/판 | ja/ko settings_region_intl, ratingCalculator_io_import_netRecords_dialog_region_intl_name | Those pickers list regions (日本 / インターナショナル / 中国; 일본 / 인터내셔널 / 중국); plates_region_* keep 日本版 / インターナショナル版 / 中国版. The typo インタナショナル and 해외 are fixed.

## en
- chart.constant | chart constant | root_pages_search_introduction, constants_index_seoDescription, ratingExplainer_formula_body | Parenthetical gloss "internal level (chart constant)" for search and first definition. The UI label "Chart constant tables" became "Internal level tables".
- chart.chart | sheet | song_seo_description, song_seo_title, song_seo_titleNoConstant, song_seo_descriptionBasic, plates_seoDescription, plates_intro, tools_tolerance_sheetSeoTitle, tools_tolerance_sheetSeoDescription | Only inside placeholders ({sheetLabel}, {sheets}); visible text says "chart".
- chart.chart | sheet | developers_policy_idsDescription | API identifier name ("sheet IDs (dsht_…)") in the developer docs.
- chart.chart | sheet | share_image_shareFailed | "share sheet" means the OS share UI, not a chart.

## ja
- rating.total | レート | plates_breadcrumb, plates_index_title, plates_index_seoTitle, plates_index_seoDescription, plates_index_intro, plates_condition_cnMerged, plates_remasterVariant_description, plates_otherPlates, home_stats_nearestPlate, home_features_plates_title, home_features_plates_description | Substring of プレート (game.plate).
- rating.total | レート | developers_terms_limits | レート制限 = API rate limit.
- rating.total | レーティング | root_seo_keywords | Meta keyword list; レーティング計算 is a real search phrase.
- rating.chart | Rating | ratingCalculator_table_headers_rating | Heads the B50 table's per-chart column, but the Aqua SQLite import also uses it to label an account's total (highest_rating), so it stays Rating until the two get separate keys. Every other per-chart value says 単曲レート.

## ko
- rating.total | 레이트 | plates_index_title, home_features_plates_description | Substring of 플레이트.
- chart.constant | 정수 | tools_rating_targetInvalid | 정수 = integer ("enter a whole number like 280").

## zh-Hans / zh-Hant
- chart.latest | 新谱面 / 新譜面 | root_pages_recent_title, root_pages_recent_seoTitle, root_pages_recent_iconLabel, sheet_chartDiscovery_recent_title, home_recent_title, home_features_recent_title, home_features_recent_description | The canonical 最新谱面 / 最新譜面 contains the avoid term.
- rating.b15 | 新谱 | same 7 keys (zh-Hans) | Substring of the canonical 最新谱面.
- rating.b15 | 新版本 | settings_versionUpdate_title, settings_versionAndRegion_regional, developers_policy_versions, developers_policy_versionsDescription | New app, game or API version, not B15.
- rating.b15 / rating.b35 | b15 / b35 | ratingCalculator_statistics_histogramLabel | The placeholders {b15} / {b35}.
- rating.b35 | 旧版本 / 舊版本 | ratingCalculator_empty_description, ratingExplainer_intro (zh-Hans), ratingExplainer_faq_a1 | Defines B35 as the best 35 from older game versions, paired with 当前版本; game-version sense.
- chart.constant | 谱面定数 / 譜面定數 | rule applied to both: the full form appears only in SEO keys (*seoTitle, *seoDescription, song_seo_*), the same 12 keys in each locale; every UI string uses 定数 / 定數. seo.test.ts:212 (zh-Hans hubTitle 谱面定数) still holds.

## vi, id, th, ms, fil, my
- No glossary_check hits.
- th: rating.total is เรตติ้ง throughout. The only Latin "Rating" left is in root_seo_keywords (search phrases); the rest is the brand DXRating. Chart rating is written เรตติ้งชาร์ตเดี่ยว ("single-chart rating"), which mirrors en "Single-chart rating" and starts with the canonical เรตติ้งชาร์ต.
- ms, fil, my: "(chart constant)" / "(constant)" glosses in SEO and explainer copy mirror en (see en).

## Same-as-base review (values identical to en)
Translated: id 4 (breadcrumb label ×2, Deprecation, Grid), fil 5 (theme light/dark/system, about_author, completion_shareTitle), my 11 (artist, chart designer ×2, diving-fish username, logo alts ×3, coefficient, community, generic region, security key), vi/th/ms 0.
The rest are justified:
- game terms the glossary keeps in Latin (Rating, Achievement, DX Score, Chart, Level, Internal level, Rank, Combo, Sync, Standard, Utage, Buddy, TAP/HOLD…, FC/AP…, International)
- proper nouns and brands (Google, LXNS, Diving-Fish, AquaDX, maimai NET, domains)
- placeholder-only or numeric values
- loanwords each catalog already uses in its own sentences: fil Taglish Account, Password, Favorite, available, Privacy Policy, Region, Cloud save; my Cloud save, Build, Commit, Passkey
- developer jargon (Changelog, Server URL, API docs)
Counts left: fil 224, my 146, id 129, ms 108, vi 106, th 71.

## Tests updated
These now expect "Latest charts": HomeHub.test.tsx:32, AppTabs.test.tsx:118 and RecentPage.test.tsx:63. ImportFromJSONButtonListItem.test.tsx:191 now expects "DX Score". The remaining matches for old en text in src are comments and test names only.

## Glossary objections
- Avoid terms that can never clear because they sit inside the canonical term: zh chart.latest 新谱面 / 新譜面 and zh-Hans rating.b15 新谱 are inside the canonical 最新谱面.
- en/SEA chart.latest avoid entries ("New charts", "Chart baru", "Chart baharu", "Mga bagong chart", "Chart အသစ်များ") also match legitimate sentence-initial B15 wording. recommend_new/old were reworded to "B15 new charts" / "B35 old charts" per the glossary note.
- ko rating.chart 단일 채보 레이팅 is long in titles such as "단일 채보 레이팅 계산기".
- en "Single-chart rating" (tool names, explainer) vs the glossary's "chart rating": not in the avoid list, left as is; decide whether the tool name should change.
