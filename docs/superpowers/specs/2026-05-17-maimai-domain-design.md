# Maimai Domain Shared Package Design

Status: approved for design by the user on 2026-05-17.

## Context

DXRating currently has three related architecture frictions:

- **Song Catalog** rules are duplicated between web pages, imports, and backend oneshot rendering.
- **Best 50** and per-entry rating rules differ between web and backend.
- **Rating Import** providers each repeat sheet matching, normalization, missing-sheet handling, and dedupe rules.

The new shared package creates one real **seam** for maimai DX domain behavior. Web components, backend render routes, and provider-specific fetch/file code become **Adapters** around it.

## Goals

- Add a new shared package, tentatively `@gekichumai/maimai-domain`.
- Make **Song Catalog** the first migration slice because **Best 50** and **Rating Import** both depend on stable sheet matching.
- Move rating award and **Best 50** selection into the shared package.
- Move provider row normalization for LXNS, MaimaiNET, Diving Fish, AquaDX, MuNET, and Aqua SQLite into the shared package.
- Include backend **Oneshot Image** calculation in the migration so web and backend use one rating implementation.

## Non-Goals

- Do not move UI behavior into the package: dialogs, toasts, haptics, localStorage, file pickers, and network requests stay in app Adapters.
- Do not add fuzzy or alias-based matching for imports. **Rating Import** uses explicit **Provider Sheet References** only.
- Do not redesign oRPC contracts as part of this work.
- Do not move generated `dxdata.json`; the new package consumes the generated **Song Catalog**.

## Architecture

The package exposes three deep Modules.

### Song Catalog Module

The **Song Catalog Module** owns:

- **Sheet Identity** formatting and parsing.
- **Versioned Sheet** projection from generated song/sheet data.
- Version-specific internal level resolution.
- UTAGE rating eligibility.
- Explicit **Provider Sheet Reference** resolution:
  - existing **Sheet Identity**,
  - title/type/difficulty,
  - internal id/type/difficulty,
  - provider music id plus difficulty through a provider-supplied music-id map.

It has two Adapter styles:

- a pure builder that accepts generated data, used by tests and backend code that wants explicit construction;
- a convenience Adapter that imports `@gekichumai/dxdata`, used by common web/backend callers.

The Module deliberately does not perform fuzzy search or alias lookup. If a provider row cannot resolve to one **Sheet Identity**, it becomes an **Import Warning** in the **Rating Import Module**.

### Best 50 Module

The **Best 50 Module** owns:

- the rating coefficient table;
- AP/AP+ rating bonus behavior;
- **Best 50** current-version and older-version selection;
- region availability checks;
- CiRCLE-era current-version behavior;
- provider-supplied **Best 50 Bucket** hints.

This makes web calculator statistics, export flows, and backend **Oneshot Image** calculation use one **Interface**. Backend oneshot ratings will follow the same AP/AP+ bonus behavior as the web calculator after migration.

### Rating Import Module

The **Rating Import Module** owns provider-to-domain normalization. It accepts typed provider rows plus a **Song Catalog**, then returns normalized entries and warnings:

```ts
type RatingImportResult = {
  entries: RatingEntry[]
  warnings: ImportWarning[]
}
```

The Module is lenient:

- matched rows become **Rating Entries**;
- unmatched rows become **Import Warnings**;
- repeated rows for the same **Sheet Identity** are deduped by keeping the highest-achievement **Rating Entry**.

Provider-specific fetching and parsing remain outside:

- LXNS OAuth/network calls stay in backend/web Adapters.
- MaimaiNET SSE/progress stays in its current Adapter.
- Browser file picking stays in web components.
- Aqua SQLite database reading can remain a web Adapter initially; the shared package normalizes typed Aqua rows, selected user, and sheet matching.

## Data Flow

1. Web and backend build or import a **Song Catalog**.
2. **Rating Import** Adapters fetch/read provider data and parse it into provider row types.
3. The shared **Rating Import Module** resolves provider rows through the **Song Catalog**, returns **Rating Entries** and **Import Warnings**, and dedupes by highest achievement.
4. The web calculator stores normalized **Rating Entries**.
5. The shared **Best 50 Module** resolves entries through the **Song Catalog**, computes rating awards, applies region/version rules, and returns calculated entries and statistics.
6. Backend **Oneshot Image** rendering uses the shared **Best 50 Module** for raw entries. If a request already supplies calculated buckets, oneshot still enriches and ranks entries through shared catalog/rating code.

## Migration Plan

1. Create `packages/maimai-domain` with TypeScript config, package exports, and workspace dependencies from web/backend.
2. Implement **Song Catalog Module** and tests.
3. Replace `apps/web/src/songs.ts` sheet projection and backend oneshot sheet projection with the shared Module.
4. Implement **Best 50 Module** and migrate existing web rating tests into the package.
5. Replace `apps/web/src/utils/rating.ts`, `useRatingEntries`, and backend oneshot rating calculation with the shared Module.
6. Implement **Rating Import Module** provider normalizers with fixtures.
7. Update web import Adapters to call shared normalizers and surface **Import Warnings**.
8. Remove duplicate rating/catalog/import normalization code once callers use the shared package.

## Error Handling

- Provider payload parse failures remain Adapter errors because the provider data was not usable.
- Missing sheet matches are **Import Warnings**, not fatal errors.
- Invalid achievement ranges or impossible provider values are row-level warnings unless the provider Adapter cannot parse the file/response at all.
- **Best 50** calculation ignores entries whose **Sheet Identity** is not in the **Song Catalog** and can report them as warnings when invoked from import flows.

## Testing

`packages/maimai-domain` should own unit tests for:

- **Sheet Identity** formatting/parsing;
- **Provider Sheet Reference** resolution;
- version-specific internal levels;
- UTAGE rating eligibility;
- rating thresholds and AP/AP+ bonus;
- region and CiRCLE-era **Best 50** rules;
- provider-supplied **Best 50 Bucket** hints;
- import warnings for unmatched provider rows;
- dedupe by highest achievement.

Web tests should become Adapter tests: import dialogs, hooks, and storage mutation call the shared Modules correctly.

Backend tests should keep HTTP/render smoke coverage for **Oneshot Image** rendering, while rating selection correctness lives in shared package tests.

## Open Decisions Closed

- Shared package seam: yes.
- Scope: **Song Catalog**, **Best 50**, and **Rating Import**.
- Import behavior: lenient with **Import Warnings**.
- **Rating Entry** shape: normalized fields plus source metadata and provider-supplied **Best 50 Bucket** hints.
- **Song Catalog** dependency style: pure builders plus `@gekichumai/dxdata` convenience Adapter.
- Migration order: **Song Catalog** first, then **Best 50**, then **Rating Import**.
- Matching policy: explicit **Provider Sheet References**, no fuzzy matching.
- Dedupe policy: keep highest achievement per **Sheet Identity**.
- Backend **Oneshot Image**: include in the first implementation plan once **Best 50 Module** exists.
