# Accessibility review — 2026-09-30

Scope: shared page shell and chart-search filters. This is not certification of the entire application. Locations below are relative to `apps/web/src/`.

## Native controls and keyboard access

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | `components/sheet/filters/SheetFilterSection.tsx:22` (all six filter sections) | Unnamed reset div mounted only on mouse hover | Always-present native button, section-specific localized name, 40px minimum target; scale animation removed | Keyboard and assistive-technology users can discover and reset individual filters |
| MEDIUM | `index.css:205` | MUI button reset could suppress the browser outline; reset button had no verified keyboard indicator | Native `outline: auto` on keyboard focus | Visible focus identifies the current action; inspected reset computed outline is `auto` |

## Names and states

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `components/sheet/filters/SheetCategoryFilter.tsx:36`, `SheetDifficultyFilter.tsx:44`, `SheetVersionFilter.tsx:37`, `SheetFavoritesFilter.tsx:25` (same directory) | Selection conveyed by appearance alone | `aria-pressed` reflects selection | Assistive technology can announce filter state |
| MEDIUM | `components/sheet/SheetSortSelect.tsx:67` | Unnamed removal icon; removal remained enabled while sorting was unavailable | Localized rule-number label and native disabled state | Users can identify the rule being removed; keyboard behavior matches availability |

## Structure and navigation

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `routes/__root.tsx:181`, `routes/__root.tsx:196`; former page mains in `pages/LegalLayout.tsx:19`, `pages/DevelopersPage.tsx:36`, `pages/RecentPage.tsx:21`, `pages/TrendingPage.tsx:65`, `routes/account/security.tsx:18`, `components/global/NotFoundContent.tsx:9` | No bypass link; main landmark depended on route | Localized first-focus skip link, shared focusable main; page wrappers no longer create nested mains | Keyboard users bypass repeated navigation and landmark navigation has one content target |

## Reduced motion

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `index.css:91` | Radix collapsible slides/scales ignored motion preference | Animations gated by `prefers-reduced-motion: no-preference` | Reduces unwanted movement for users requesting reduced motion |
| MEDIUM | `components/sheet/SheetSortFilter.tsx:421`, `components/sheet/SheetSortSelect.tsx:35`, `components/sheet/filters/SheetFilterLevelInputLongPressSlider.tsx:89` | Other filter transitions use scaling/movement without preference guards | Remaining work: respect reduced motion for these independent animation paths | Current patch does not establish application-wide reduced-motion support |

## Verification

- `pnpm lint`: passed, 26 warnings and zero errors.
- `pnpm exec oxfmt --check apps/web/src`: passed.
- Web production build including TypeScript: passed.
- 45 tests passed across 13 targeted files, including a new regression test for discoverable, separately named reset buttons and their callbacks.
- Japanese production preview at port 42891: first Tab focused the visible localized skip link; Enter then Tab reached the filter trigger; Enter expanded filters. Space deselected BASIC, and Shift+Tab then Enter activated the difficulty reset and restored selection/results. The reset remained focused with a native outline.
- Browser accessibility tree exposed localized reset names and filter states. DOM contained exactly one main. Captured console returned no errors or warnings.
- Focused automated DOM audit inspected 58 controls: no broken `aria-labelledby` references or positive tabindex values. The only unnamed inputs were MUI's intentional `aria-hidden`, tabindex -1 select backing inputs. This is not a full axe/WCAG audit.
- Not verified: actual screen-reader speech, all keyboard flows, forced-colors rendering, every theme's focus visibility, 200% zoom, exact 320px reflow, full automated WCAG audit, authenticated/server-backed flows, and all other pages. Browser viewport requested at 320px reported 480px, so it did not establish 320px coverage.

Approve — inspected fixes only. No known HIGH finding remains in this scope; the remaining MEDIUM motion findings are work to do. Uninspected flows are not approved.
