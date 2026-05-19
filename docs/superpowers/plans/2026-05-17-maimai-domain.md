# Maimai Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@gekichumai/maimai-domain` as the shared Module for Song Catalog, Best 50, and Rating Import behavior, then migrate web and backend oneshot callers to use it.

**Architecture:** Create one shared package with pure TypeScript Modules and a `@gekichumai/dxdata` convenience Adapter. Migrate in order: Song Catalog first, Best 50 second, Rating Import third, so provider normalization and oneshot rendering depend on stable Sheet Identity and Versioned Sheet resolution.

**Tech Stack:** pnpm workspace, TypeScript strict mode, Vitest, React 19 web app, Hono backend, `@gekichumai/dxdata`.

---

## File Structure

Create:

- `packages/maimai-domain/package.json` — package metadata, scripts, workspace dependency on `@gekichumai/dxdata`, dev dependency on `vitest`.
- `packages/maimai-domain/tsconfig.json` — strict TypeScript config for package tests and build checks.
- `packages/maimai-domain/index.ts` — public exports only.
- `packages/maimai-domain/src/types.ts` — shared domain types: `SheetIdentity`, `ProviderSheetReference`, `RatingEntry`, `Best50Bucket`, `ImportWarning`, `ImportProvider`, `Region`.
- `packages/maimai-domain/src/sheet-identity.ts` — Sheet Identity formatting/parsing and equality helpers.
- `packages/maimai-domain/src/song-catalog.ts` — pure Song Catalog builder and resolver.
- `packages/maimai-domain/src/dxdata-catalog.ts` — convenience Adapter that builds a Song Catalog from `@gekichumai/dxdata`.
- `packages/maimai-domain/src/best50.ts` — rating award calculation, entry enrichment, Best 50 selection, statistics.
- `packages/maimai-domain/src/import-normalizers.ts` — provider row types and normalization functions for LXNS, MaimaiNET, Diving Fish, AquaDX, MuNET, and Aqua SQLite.
- `packages/maimai-domain/src/__tests__/sheet-identity.test.ts`
- `packages/maimai-domain/src/__tests__/song-catalog.test.ts`
- `packages/maimai-domain/src/__tests__/best50.test.ts`
- `packages/maimai-domain/src/__tests__/import-normalizers.test.ts`

Modify:

- `apps/web/package.json` — add `@gekichumai/maimai-domain`.
- `apps/backend/package.json` — add `@gekichumai/maimai-domain`.
- `apps/web/src/songs.ts` — delegate Versioned Sheet projection and Sheet Identity helpers to the package.
- `apps/web/src/utils/rating.ts` — re-export or remove after migrating callers.
- `apps/web/src/components/rating/useRatingEntries.tsx` — use shared Best 50 Module.
- `apps/web/src/components/rating/RatingCalculatorAddEntryForm.tsx` — align `PlayEntry` with shared `RatingEntry` shape or use an Adapter type with explicit conversion.
- `apps/web/src/components/rating/io/import/*.tsx` and `importFromNETRecords.tsx` — call shared Rating Import normalizers and surface Import Warnings.
- `apps/web/src/utils/aquaDB.ts` — keep SQLite row reading, move import-ready normalization to shared package.
- `apps/backend/src/services/functions/oneshot-renderer/index.tsx` — use shared Song Catalog and Best 50 Modules.
- `apps/backend/src/services/functions/oneshot-renderer/calculateRating.ts` — delete after migration or leave as a re-export during transition.
- `apps/backend/src/services/functions/oneshot-renderer/calculateDXScore.ts` — keep local; DX score stars are outside the first shared package scope.

---

### Task 1: Scaffold Shared Package

**Files:**

- Create: `packages/maimai-domain/package.json`
- Create: `packages/maimai-domain/tsconfig.json`
- Create: `packages/maimai-domain/index.ts`
- Create: `packages/maimai-domain/src/types.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Write the package metadata**

Create `packages/maimai-domain/package.json`:

```json
{
  "name": "@gekichumai/maimai-domain",
  "version": "1.6.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gekichumai/dxdata": "workspace:*"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Create `packages/maimai-domain/tsconfig.json`:

```json
{
  "extends": "../tsconfig/base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "types": ["vitest/globals"]
  },
  "include": ["index.ts", "src/**/*.ts"]
}
```

- [ ] **Step 3: Add domain type skeleton**

Create `packages/maimai-domain/src/types.ts`:

```ts
import type { DifficultyEnum, Sheet, Song, TypeEnum, VersionEnum } from '@gekichumai/dxdata'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export interface SheetIdentity {
  songId: string
  type: TypeEnum
  difficulty: DifficultyEnum
}

export type ProviderSheetReference =
  | { kind: 'identity'; identity: SheetIdentity }
  | { kind: 'title'; title: string; type: TypeEnum; difficulty: DifficultyEnum }
  | { kind: 'internal-id'; internalId: number; type: TypeEnum; difficulty: DifficultyEnum }
  | { kind: 'provider-music-id'; musicId: string | number; difficulty: DifficultyEnum; map: ProviderMusicIdMap }

export type ProviderMusicIdMap = Record<string, { name: string; ver?: string }>

export interface VersionedSheet extends Song, Sheet {
  id: string
  identity: SheetIdentity
  isTypeUtage: boolean
  isRatingEligible: boolean
  releaseDateTimestamp: number | null
}

export type ImportProvider = 'lxns' | 'maimai-net' | 'diving-fish' | 'aqua-dx' | 'mu-net' | 'aqua-sqlite'

export type Best50Bucket = 'b15' | 'b35'

export type ComboFlag = 'fc' | 'fcp' | 'ap' | 'app' | null
export type SyncFlag = 'fs' | 'fsp' | 'fsd' | 'fsdp' | 'sync' | null

export interface RatingEntry {
  sheetId: string
  identity: SheetIdentity
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  source?: {
    provider: ImportProvider
    providerId?: string | number
    providerSongName?: string
    best50Bucket?: Best50Bucket
  }
}

export interface ImportWarning {
  provider: ImportProvider
  code: 'sheet-not-found' | 'invalid-difficulty' | 'invalid-type' | 'invalid-achievement'
  message: string
  row: unknown
}
```

- [ ] **Step 4: Add public exports**

Create `packages/maimai-domain/index.ts`:

```ts
export * from './src/types'
```

- [ ] **Step 5: Add workspace dependencies to apps**

In `apps/web/package.json`, add this dependency near `@gekichumai/dxdata`:

```json
"@gekichumai/maimai-domain": "workspace:*"
```

In `apps/backend/package.json`, add this dependency near `@gekichumai/dxdata`:

```json
"@gekichumai/maimai-domain": "workspace:*"
```

- [ ] **Step 6: Install lockfile updates**

Run:

```bash
pnpm install
```

Expected: pnpm completes successfully and updates `pnpm-lock.yaml`.

- [ ] **Step 7: Verify package scaffold**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain build
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 8: Commit scaffold**

Run:

```bash
git add packages/maimai-domain apps/web/package.json apps/backend/package.json pnpm-lock.yaml
git commit -m "feat: scaffold maimai domain package"
```

---

### Task 2: Implement Sheet Identity Module

**Files:**

- Create: `packages/maimai-domain/src/sheet-identity.ts`
- Modify: `packages/maimai-domain/index.ts`
- Test: `packages/maimai-domain/src/__tests__/sheet-identity.test.ts`

- [ ] **Step 1: Write failing Sheet Identity tests**

Create `packages/maimai-domain/src/__tests__/sheet-identity.test.ts`:

```ts
import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { formatSheetIdentity, parseSheetIdentity, sameSheetIdentity } from '../sheet-identity'

describe('Sheet Identity', () => {
  it('formats identity with the existing DXRating separator', () => {
    expect(
      formatSheetIdentity({
        songId: '君の知らない物語',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBe('君の知らない物語__dxrt__dx__dxrt__master')
  })

  it('parses a formatted identity back into parts', () => {
    expect(parseSheetIdentity('song-a__dxrt__std__dxrt__expert')).toEqual({
      songId: 'song-a',
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Expert,
    })
  })

  it('returns null for malformed identity strings', () => {
    expect(parseSheetIdentity('song-a/std/expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__bad__dxrt__expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__dx__dxrt__bad')).toBeNull()
  })

  it('compares identities by song id, type, and difficulty', () => {
    const a = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const b = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const c = { songId: 'song-a', type: TypeEnum.STD, difficulty: DifficultyEnum.Master }
    expect(sameSheetIdentity(a, b)).toBe(true)
    expect(sameSheetIdentity(a, c)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/sheet-identity.test.ts
```

Expected: FAIL because `../sheet-identity` does not exist.

- [ ] **Step 3: Implement Sheet Identity helpers**

Create `packages/maimai-domain/src/sheet-identity.ts`:

```ts
import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SheetIdentity } from './types'

export const SHEET_IDENTITY_SEPARATOR = '__dxrt__'

const TYPE_VALUES = new Set<string>(Object.values(TypeEnum))
const DIFFICULTY_VALUES = new Set<string>(Object.values(DifficultyEnum))

export function formatSheetIdentity(identity: SheetIdentity): string {
  return [identity.songId, identity.type, identity.difficulty].join(SHEET_IDENTITY_SEPARATOR)
}

export function parseSheetIdentity(value: string): SheetIdentity | null {
  const parts = value.split(SHEET_IDENTITY_SEPARATOR)
  if (parts.length !== 3) return null
  const [songId, type, difficulty] = parts
  if (!songId || !TYPE_VALUES.has(type) || !DIFFICULTY_VALUES.has(difficulty)) return null
  return {
    songId,
    type: type as TypeEnum,
    difficulty: difficulty as DifficultyEnum,
  }
}

export function sameSheetIdentity(a: SheetIdentity, b: SheetIdentity): boolean {
  return a.songId === b.songId && a.type === b.type && a.difficulty === b.difficulty
}
```

- [ ] **Step 4: Export Sheet Identity helpers**

Update `packages/maimai-domain/index.ts`:

```ts
export * from './src/sheet-identity'
export * from './src/types'
```

- [ ] **Step 5: Run Sheet Identity tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/sheet-identity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Sheet Identity Module**

Run:

```bash
git add packages/maimai-domain
git commit -m "feat: add sheet identity module"
```

---

### Task 3: Implement Song Catalog Module

**Files:**

- Create: `packages/maimai-domain/src/song-catalog.ts`
- Create: `packages/maimai-domain/src/dxdata-catalog.ts`
- Modify: `packages/maimai-domain/index.ts`
- Test: `packages/maimai-domain/src/__tests__/song-catalog.test.ts`

- [ ] **Step 1: Write failing Song Catalog tests**

Create `packages/maimai-domain/src/__tests__/song-catalog.test.ts`:

```ts
import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { buildSongCatalog } from '../song-catalog'

const fixtureData: DXData = {
  updateTime: '2026-05-17T00:00:00.000Z',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  regions: [],
  songs: [
    {
      songId: 'song-a',
      title: 'Song A',
      artist: 'Artist',
      bpm: 180,
      category: CategoryEnum.Maimai,
      imageName: 'song-a',
      isNew: false,
      isLocked: false,
      searchAcronyms: ['sa'],
      sheets: [
        {
          internalId: 10001,
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13+',
          internalLevelValue: 13.7,
          multiverInternalLevelValue: {
            [VersionEnum.CiRCLE]: 13.8,
          } as Partial<Record<VersionEnum, number>>,
          noteDesigner: 'Designer',
          noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
          regions: { jp: true, intl: true, cn: false },
          isSpecial: false,
          version: VersionEnum.PRiSMPLUS,
          releaseDate: '2025-03-01',
        },
        {
          internalId: 20001,
          type: TypeEnum.UTAGE,
          difficulty: DifficultyEnum.Master,
          level: '宴',
          internalLevelValue: 0,
          noteDesigner: null,
          noteCounts: { tap: null, hold: null, slide: null, touch: null, break: null, total: null },
          regions: { jp: true, intl: false, cn: false },
          isSpecial: true,
          version: VersionEnum.PRiSMPLUS,
        },
      ],
    },
  ],
}

describe('Song Catalog', () => {
  it('projects Versioned Sheets with identity, id, and selected internal level', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.getByIdentity({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })

    expect(sheet?.id).toBe('song-a__dxrt__dx__dxrt__master')
    expect(sheet?.identity).toEqual({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })
    expect(sheet?.internalLevelValue).toBe(13.8)
    expect(sheet?.releaseDateTimestamp).toBe(new Date('2025-03-01T06:00:00+09:00').valueOf())
  })

  it('marks UTAGE sheets as not rating eligible', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.getByIdentity({
      songId: 'song-a',
      type: TypeEnum.UTAGE,
      difficulty: DifficultyEnum.Master,
    })

    expect(sheet?.isTypeUtage).toBe(true)
    expect(sheet?.isRatingEligible).toBe(false)
  })

  it('resolves explicit provider references without fuzzy matching', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song A',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      })?.identity.songId,
    ).toBe('song-a')

    expect(
      catalog.resolveReference({
        kind: 'internal-id',
        internalId: 10001,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      })?.identity.songId,
    ).toBe('song-a')

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBeNull()
  })

  it('resolves provider music id maps through exact mapped names', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 10001,
      difficulty: DifficultyEnum.Master,
      map: {
        '10001': { name: 'Song A' },
      },
    })

    expect(sheet?.identity).toEqual({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/song-catalog.test.ts
```

Expected: FAIL because `../song-catalog` does not exist.

- [ ] **Step 3: Implement Song Catalog Module**

Create `packages/maimai-domain/src/song-catalog.ts`:

```ts
import { TypeEnum, type DXData, type DifficultyEnum, type Song, type VersionEnum } from '@gekichumai/dxdata'
import { formatSheetIdentity, parseSheetIdentity } from './sheet-identity'
import type { ProviderSheetReference, SheetIdentity, VersionedSheet } from './types'

export interface SongCatalog {
  version: VersionEnum
  sheets: VersionedSheet[]
  getById: (id: string) => VersionedSheet | null
  getByIdentity: (identity: SheetIdentity) => VersionedSheet | null
  resolveReference: (reference: ProviderSheetReference) => VersionedSheet | null
}

export function buildSongCatalog(data: DXData, version: VersionEnum): SongCatalog {
  const sheets = data.songs.flatMap((song) => projectSong(song, version))
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]))
  const byTitle = new Map<string, VersionedSheet>()
  const byInternalId = new Map<string, VersionedSheet>()

  for (const sheet of sheets) {
    byTitle.set(titleKey(sheet.title, sheet.type, sheet.difficulty), sheet)
    if (sheet.internalId !== undefined) {
      byInternalId.set(internalIdKey(sheet.internalId, sheet.type, sheet.difficulty), sheet)
    }
  }

  return {
    version,
    sheets,
    getById: (id) => byId.get(id) ?? null,
    getByIdentity: (identity) => byId.get(formatSheetIdentity(identity)) ?? null,
    resolveReference: (reference) => {
      switch (reference.kind) {
        case 'identity':
          return byId.get(formatSheetIdentity(reference.identity)) ?? null
        case 'title':
          return byTitle.get(titleKey(reference.title, reference.type, reference.difficulty)) ?? null
        case 'internal-id':
          return byInternalId.get(internalIdKey(reference.internalId, reference.type, reference.difficulty)) ?? null
        case 'provider-music-id': {
          const mapped = reference.map[String(reference.musicId)]
          if (!mapped || mapped.ver === '24000') return null
          const numericId = typeof reference.musicId === 'number' ? reference.musicId : Number.parseInt(reference.musicId, 10)
          const type = Number.isFinite(numericId) && numericId >= 10000 ? TypeEnum.DX : TypeEnum.STD
          return byTitle.get(titleKey(mapped.name, type, reference.difficulty)) ?? null
        }
      }
    },
  }
}

function projectSong(song: Song, version: VersionEnum): VersionedSheet[] {
  return song.sheets.map((sheet) => {
    const identity = {
      songId: song.songId,
      type: sheet.type,
      difficulty: sheet.difficulty,
    }
    const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P
    return {
      ...song,
      ...sheet,
      id: formatSheetIdentity(identity),
      identity,
      isTypeUtage,
      isRatingEligible: !isTypeUtage,
      releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : null,
      internalLevelValue: sheet.multiverInternalLevelValue?.[version] ?? sheet.internalLevelValue,
    }
  })
}

function titleKey(title: string, type: TypeEnum, difficulty: DifficultyEnum): string {
  return `${title}\u0000${type}\u0000${difficulty}`
}

function internalIdKey(internalId: number, type: TypeEnum, difficulty: DifficultyEnum): string {
  return `${internalId}\u0000${type}\u0000${difficulty}`
}

export function getSheetIdentityFromId(id: string): SheetIdentity | null {
  return parseSheetIdentity(id)
}
```

- [ ] **Step 4: Implement dxdata convenience Adapter**

Create `packages/maimai-domain/src/dxdata-catalog.ts`:

```ts
import { dxdata, type VersionEnum } from '@gekichumai/dxdata'
import { buildSongCatalog, type SongCatalog } from './song-catalog'

const cache = new Map<VersionEnum, SongCatalog>()

export function getDxdataSongCatalog(version: VersionEnum): SongCatalog {
  const cached = cache.get(version)
  if (cached) return cached
  const catalog = buildSongCatalog(dxdata, version)
  cache.set(version, catalog)
  return catalog
}
```

- [ ] **Step 5: Export Song Catalog APIs**

Update `packages/maimai-domain/index.ts`:

```ts
export * from './src/dxdata-catalog'
export * from './src/sheet-identity'
export * from './src/song-catalog'
export * from './src/types'
```

- [ ] **Step 6: Run Song Catalog tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/song-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run package tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test
```

Expected: all package tests PASS.

- [ ] **Step 8: Commit Song Catalog Module**

Run:

```bash
git add packages/maimai-domain
git commit -m "feat: add song catalog module"
```

---

### Task 4: Migrate Web and Backend Sheet Projection

**Files:**

- Modify: `apps/web/src/songs.ts`
- Modify: `apps/backend/src/services/functions/oneshot-renderer/index.tsx`
- Test: `packages/maimai-domain/src/__tests__/song-catalog.test.ts`

- [ ] **Step 1: Update web imports**

In `apps/web/src/songs.ts`, replace direct local Sheet Identity helpers with shared imports:

```ts
import {
  formatSheetIdentity,
  getDxdataSongCatalog,
  type VersionedSheet,
} from '@gekichumai/maimai-domain'
```

Keep imports from `@gekichumai/dxdata` for enums used in UI.

- [ ] **Step 2: Replace web `FlattenedSheet` alias**

In `apps/web/src/songs.ts`, replace the current `FlattenedSheet` type with:

```ts
export type FlattenedSheet = VersionedSheet & {
  tags: number[]
}
```

- [ ] **Step 3: Replace web canonical id helpers**

In `apps/web/src/songs.ts`, replace `canonicalId` and `canonicalIdFromParts` with:

```ts
export const canonicalId = (song: Song, sheet: Sheet) => {
  return formatSheetIdentity({
    songId: song.songId,
    type: sheet.type,
    difficulty: sheet.difficulty,
  })
}

export const canonicalIdFromParts = (songId: string, type: TypeEnum, difficulty: DifficultyEnum) => {
  return formatSheetIdentity({ songId, type, difficulty })
}
```

- [ ] **Step 4: Replace web sheet projection**

In `apps/web/src/songs.ts`, replace `getFlattenedSheets` with:

```ts
export const getFlattenedSheets = async (version: VersionEnum): Promise<FlattenedSheet[]> => {
  return getDxdataSongCatalog(version).sheets.map((sheet) => ({
    ...sheet,
    tags: [],
  }))
}
```

- [ ] **Step 5: Update backend oneshot imports**

In `apps/backend/src/services/functions/oneshot-renderer/index.tsx`, replace `type Sheet`, `type Song`, and `dxdata` imports with:

```ts
import { getDxdataSongCatalog, type VersionedSheet } from '@gekichumai/maimai-domain'
import { VersionEnum } from '@gekichumai/dxdata'
```

- [ ] **Step 6: Replace backend oneshot sheet map**

In `apps/backend/src/services/functions/oneshot-renderer/index.tsx`, delete `CANONICAL_ID_PARTS_SEPARATOR`, local `canonicalId`, `getFlattenedSheetsMap`, `flattenedSheets`, and local `FlattenedSheet`. Add:

```ts
type FlattenedSheet = VersionedSheet

const getFlattenedSheet = (version: VersionEnum, sheetId: string): FlattenedSheet | null => {
  return getDxdataSongCatalog(version).getById(sheetId)
}
```

Then replace:

```ts
const sheet = flattenedSheets.get(version)?.get(entry.sheetId)
```

with:

```ts
const sheet = getFlattenedSheet(version, entry.sheetId)
```

- [ ] **Step 7: Run targeted checks**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test
pnpm --filter @gekichumai/dxrating-web build
pnpm --filter @gekichumai/backend build
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit projection migration**

Run:

```bash
git add apps/web/src/songs.ts apps/backend/src/services/functions/oneshot-renderer/index.tsx packages/maimai-domain
git commit -m "refactor: use shared song catalog"
```

---

### Task 5: Implement Best 50 Module

**Files:**

- Create: `packages/maimai-domain/src/best50.ts`
- Modify: `packages/maimai-domain/index.ts`
- Test: `packages/maimai-domain/src/__tests__/best50.test.ts`
- Later migrate from: `apps/web/src/utils/__tests__/rating.test.ts`

- [ ] **Step 1: Write failing Best 50 tests**

Create `packages/maimai-domain/src/__tests__/best50.test.ts`:

```ts
import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { calculateBest50, calculateRatingAward } from '../best50'
import { buildSongCatalog } from '../song-catalog'
import { formatSheetIdentity } from '../sheet-identity'
import type { RatingEntry, SheetIdentity } from '../types'

function makeData(): DXData {
  return {
    updateTime: '2026-05-17T00:00:00.000Z',
    categories: [],
    versions: [],
    types: [],
    difficulties: [],
    regions: [],
    songs: [
      makeSong('current', VersionEnum.CiRCLEPLUS, { jp: true, intl: true, cn: true }),
      makeSong('previous', VersionEnum.CiRCLE, { jp: true, intl: true, cn: true }),
      makeSong('old', VersionEnum.PRiSMPLUS, { jp: true, intl: false, cn: true }),
    ],
  }
}

function makeSong(songId: string, version: VersionEnum, regions: { jp: boolean; intl: boolean; cn: boolean }) {
  return {
    songId,
    title: songId,
    artist: 'artist',
    bpm: 120,
    category: CategoryEnum.Maimai,
    imageName: songId,
    isNew: false,
    isLocked: false,
    searchAcronyms: [],
    sheets: [
      {
        internalId: songId.length * 100,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
        level: '13',
        internalLevelValue: 13,
        noteDesigner: null,
        noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
        regions,
        isSpecial: false,
        version,
      },
    ],
  }
}

function entry(identity: SheetIdentity, achievementRate: number, best50Bucket?: 'b15' | 'b35'): RatingEntry {
  return {
    sheetId: formatSheetIdentity(identity),
    identity,
    achievementRate,
    source: best50Bucket ? { provider: 'diving-fish', best50Bucket } : undefined,
  }
}

describe('Best 50', () => {
  it('calculates rating award with AP bonus', () => {
    const withoutAp = calculateRatingAward(14, 100.5)
    const withAp = calculateRatingAward(14, 100.5, 'ap')
    expect(withAp.ratingAwardValue).toBe(withoutAp.ratingAwardValue + 1)
  })

  it('uses CiRCLE-era current and previous versions as b15 for regional catalogs', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'jp',
      entries: [
        entry({ songId: 'current', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }, 100.5),
        entry({ songId: 'previous', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }, 100.5),
        entry({ songId: 'old', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }, 100.5),
      ],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['current', 'previous'])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['old'])
  })

  it('honors provider-supplied Best 50 Bucket hints for cn region', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [
        entry({ songId: 'old', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }, 100.5, 'b15'),
      ],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['old'])
    expect(result.b35).toEqual([])
  })

  it('excludes sheets unavailable in the selected region', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'intl',
      entries: [
        entry({ songId: 'old', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }, 100.5),
      ],
    })

    expect(result.b15).toEqual([])
    expect(result.b35).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/best50.test.ts
```

Expected: FAIL because `../best50` does not exist.

- [ ] **Step 3: Implement Best 50 Module**

Create `packages/maimai-domain/src/best50.ts`:

```ts
import { VERSION_ID_MAP, VersionEnum, type VersionEnum as Version } from '@gekichumai/dxdata'
import type { ComboFlag, RatingEntry, Region } from './types'
import type { SongCatalog } from './song-catalog'

export const SCORE_COEFFICIENT_TABLE: [number, number, string][] = [
  [0, 0, 'd'],
  [10, 1.6, 'd'],
  [20, 3.2, 'd'],
  [30, 4.8, 'd'],
  [40, 6.4, 'd'],
  [50, 8, 'c'],
  [60, 9.6, 'b'],
  [70, 11.2, 'bb'],
  [75, 12.0, 'bbb'],
  [79.9999, 12.8, 'bbb'],
  [80, 13.6, 'a'],
  [90, 15.2, 'aa'],
  [94, 16.8, 'aaa'],
  [96.9999, 17.6, 'aaa'],
  [97, 20, 's'],
  [98, 20.3, 'sp'],
  [98.9999, 20.6, 'sp'],
  [99, 20.8, 'ss'],
  [99.5, 21.1, 'ssp'],
  [99.9999, 21.4, 'ssp'],
  [100, 21.6, 'sss'],
  [100.4999, 22.2, 'sss'],
  [100.5, 22.4, 'sssp'],
]

export interface RatingAward {
  ratingAwardValue: number
  coefficient: number
  rank: string | null
  index: number
}

export interface CalculatedRatingEntry {
  entry: RatingEntry
  sheet: NonNullable<ReturnType<SongCatalog['getById']>>
  rating: RatingAward
  bucket: 'b15' | 'b35' | null
}

export interface Best50Result {
  allEntries: CalculatedRatingEntry[]
  b15: CalculatedRatingEntry[]
  b35: CalculatedRatingEntry[]
  statistics: {
    b15Average: number
    b35Average: number
    b15Min: number
    b35Min: number
    b15Max: number
    b35Max: number
    b15Sum: number
    b35Sum: number
    b50Sum: number
  }
}

export function calculateRatingAward(internalLevel: number, achievementRate: number, comboFlag?: ComboFlag): RatingAward {
  for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
    if (i === SCORE_COEFFICIENT_TABLE.length - 1 || achievementRate < SCORE_COEFFICIENT_TABLE[i + 1][0]) {
      const coefficient = SCORE_COEFFICIENT_TABLE[i][1]
      const apBonus = comboFlag === 'ap' || comboFlag === 'app' ? 1 : 0
      return {
        ratingAwardValue: Math.floor((coefficient * internalLevel * Math.min(100.5, achievementRate)) / 100) + apBonus,
        coefficient,
        rank: SCORE_COEFFICIENT_TABLE[i][2],
        index: i,
      }
    }
  }
  return { ratingAwardValue: 0, coefficient: 0, rank: 'd', index: 99 }
}

export function calculateBest50({
  catalog,
  version,
  region,
  entries,
}: {
  catalog: SongCatalog
  version: Version
  region: Region
  entries: RatingEntry[]
}): Best50Result {
  const calculated = entries.flatMap((entry): CalculatedRatingEntry[] => {
    const sheet = catalog.getById(entry.sheetId)
    if (!sheet || !sheet.isRatingEligible || !isAvailableInRegion(sheet.regions, region)) return []
    return [
      {
        entry,
        sheet,
        rating: calculateRatingAward(sheet.internalLevelValue, entry.achievementRate, entry.comboFlag),
        bucket: null,
      },
    ]
  })

  const b15Ids = new Set(
    calculated
      .filter((entry) => entry.entry.source?.best50Bucket === 'b15' || isB15Sheet(entry.sheet.version, version, region))
      .sort(byRatingDesc)
      .slice(0, 15)
      .map((entry) => entry.entry.sheetId),
  )

  const b35Ids = new Set(
    calculated
      .filter((entry) => !b15Ids.has(entry.entry.sheetId))
      .filter((entry) => entry.entry.source?.best50Bucket === 'b35' || isB35Sheet(entry.sheet.version, version, region))
      .sort(byRatingDesc)
      .slice(0, 35)
      .map((entry) => entry.entry.sheetId),
  )

  const allEntries = calculated.map((entry) => ({
    ...entry,
    bucket: b15Ids.has(entry.entry.sheetId) ? ('b15' as const) : b35Ids.has(entry.entry.sheetId) ? ('b35' as const) : null,
  }))
  const b15 = allEntries.filter((entry) => entry.bucket === 'b15').sort(byRatingDesc)
  const b35 = allEntries.filter((entry) => entry.bucket === 'b35').sort(byRatingDesc)
  return { allEntries, b15, b35, statistics: calculateStatistics(b15, b35) }
}

function isAvailableInRegion(regions: { jp: boolean; intl: boolean; cn: boolean }, region: Region): boolean {
  return region === '_generic' || regions[region]
}

function isB15Sheet(sheetVersion: Version, appVersion: Version, region: Region): boolean {
  if (region === '_generic') return sheetVersion === appVersion
  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheetVersion)
  if (appVersionId === undefined || sheetVersionId === undefined) return false
  const useCircleB15 = appVersionId >= VERSION_ID_MAP.get(VersionEnum.CiRCLE)!
  return useCircleB15 ? appVersionId === sheetVersionId || appVersionId === sheetVersionId + 1 : appVersionId === sheetVersionId
}

function isB35Sheet(sheetVersion: Version, appVersion: Version, region: Region): boolean {
  if (region === '_generic') return sheetVersion !== appVersion
  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheetVersion)
  if (appVersionId === undefined || sheetVersionId === undefined) return false
  const useCircleB15 = appVersionId >= VERSION_ID_MAP.get(VersionEnum.CiRCLE)!
  return useCircleB15 ? appVersionId > sheetVersionId + 1 : appVersionId > sheetVersionId
}

function byRatingDesc(a: CalculatedRatingEntry, b: CalculatedRatingEntry): number {
  return b.rating.ratingAwardValue - a.rating.ratingAwardValue
}

function calculateStatistics(b15: CalculatedRatingEntry[], b35: CalculatedRatingEntry[]): Best50Result['statistics'] {
  const b15Values = b15.map((entry) => entry.rating.ratingAwardValue)
  const b35Values = b35.map((entry) => entry.rating.ratingAwardValue)
  const b15Sum = b15Values.reduce((sum, value) => sum + value, 0)
  const b35Sum = b35Values.reduce((sum, value) => sum + value, 0)
  return {
    b15Average: b15.length === 0 ? 0 : b15Sum / b15.length,
    b35Average: b35.length === 0 ? 0 : b35Sum / b35.length,
    b15Min: b15Values.length === 0 ? 0 : Math.min(...b15Values),
    b35Min: b35Values.length === 0 ? 0 : Math.min(...b35Values),
    b15Max: b15Values.length === 0 ? 0 : Math.max(...b15Values),
    b35Max: b35Values.length === 0 ? 0 : Math.max(...b35Values),
    b15Sum,
    b35Sum,
    b50Sum: b15Sum + b35Sum,
  }
}
```

- [ ] **Step 4: Export Best 50 APIs**

Update `packages/maimai-domain/index.ts`:

```ts
export * from './src/best50'
export * from './src/dxdata-catalog'
export * from './src/sheet-identity'
export * from './src/song-catalog'
export * from './src/types'
```

- [ ] **Step 5: Run Best 50 tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/best50.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run package tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test
```

Expected: all package tests PASS.

- [ ] **Step 7: Commit Best 50 Module**

Run:

```bash
git add packages/maimai-domain
git commit -m "feat: add best 50 module"
```

---

### Task 6: Migrate Web Rating Calculation

**Files:**

- Modify: `apps/web/src/utils/rating.ts`
- Modify: `apps/web/src/components/rating/useRatingEntries.tsx`
- Modify: `apps/web/src/components/rating/RatingCalculatorAddEntryForm.tsx`
- Modify: `apps/web/src/utils/__tests__/rating.test.ts`
- Test: `packages/maimai-domain/src/__tests__/best50.test.ts`

- [ ] **Step 1: Re-export rating helpers for compatibility**

Replace `apps/web/src/utils/rating.ts` with:

```ts
export {
  SCORE_COEFFICIENT_TABLE,
  calculateRatingAward as calculateRating,
  type ComboFlag,
  type RatingAward as Rating,
} from '@gekichumai/maimai-domain'
```

- [ ] **Step 2: Update PlayEntry type to carry shared fields**

In `apps/web/src/components/rating/RatingCalculatorAddEntryForm.tsx`, import `type RatingEntry`:

```ts
import type { RatingEntry } from '@gekichumai/maimai-domain'
```

Then replace the `PlayEntry` interface with:

```ts
export interface PlayEntry extends Omit<RatingEntry, 'identity'> {
  identity?: RatingEntry['identity']
  providerConfig?: PlayEntryProviderConfig
}
```

This preserves existing stored entries while new shared normalizers can provide `identity`.

- [ ] **Step 3: Update `useRatingEntries` imports**

In `apps/web/src/components/rating/useRatingEntries.tsx`, import shared functions:

```ts
import { calculateBest50, getDxdataSongCatalog, type RatingAward } from '@gekichumai/maimai-domain'
```

Remove local `VERSION_ID_MAP`, `VersionEnum`, `filterEligibleB15Entries`, and `filterB35EligibleEntries` imports/functions from this file.

- [ ] **Step 4: Replace `useRatingEntries` calculation body**

Inside `useRatingEntries`, replace the `useMemo` that builds `calculated`, `best15OfCurrentVersionSheetIds`, and `best35OfAllOtherVersionSheetIds` with:

```ts
const { allEntries, b15Entries, b35Entries, statistics } = useMemo(() => {
  const computeStart = performance.now()
  const catalog = getDxdataSongCatalog(appVersion)
  const normalizedEntries = entries.flatMap((entry) => {
    const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId)
    const identity = entry.identity ?? catalog.getById(entry.sheetId)?.identity
    if (!sheet || !identity) return []
    return [
      {
        sheetId: entry.sheetId,
        identity,
        achievementRate: entry.achievementRate,
        comboFlag: entry.comboFlag,
        syncFlag: entry.syncFlag,
        source: entry.providerConfig?.divingFish?.ratingEligibility
          ? {
              provider: 'diving-fish' as const,
              best50Bucket: entry.providerConfig.divingFish.ratingEligibility,
            }
          : undefined,
        originalEntry: entry,
      },
    ]
  })

  const result = calculateBest50({
    catalog,
    version: appVersion,
    region,
    entries: normalizedEntries.map(({ originalEntry: _, ...entry }) => entry),
  })

  const webEntries = result.allEntries.map((entry) => ({
    ...normalizedEntries.find((candidate) => candidate.sheetId === entry.entry.sheetId)!.originalEntry,
    sheet: entry.sheet as FlattenedSheet,
    rating: entry.rating as RatingAward,
    includedIn: entry.bucket,
  }))

  Sentry.metrics.distribution('rating_calculation.duration', performance.now() - computeStart, {
    unit: 'millisecond',
    attributes: { entry_count: String(entries.length) },
  })

  return {
    allEntries: webEntries,
    b15Entries: webEntries.filter((entry) => entry.includedIn === 'b15'),
    b35Entries: webEntries.filter((entry) => entry.includedIn === 'b35'),
    statistics: result.statistics,
  }
}, [entries, sheets, appVersion, region])
```

Remove the following `statistics` `useMemo`, because shared `calculateBest50` now returns statistics.

- [ ] **Step 5: Move rating tests to shared package**

Keep `apps/web/src/utils/__tests__/rating.test.ts` as a compatibility smoke test:

```ts
import { describe, expect, it } from 'vitest'
import { calculateRating } from '../rating'

describe('rating compatibility exports', () => {
  it('calculates known SSS+ rating through shared package', () => {
    expect(calculateRating(14.0, 100.5).ratingAwardValue).toBe(315)
  })
})
```

The detailed threshold tests live in `packages/maimai-domain/src/__tests__/best50.test.ts`.

- [ ] **Step 6: Run rating tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/best50.test.ts
pnpm --filter @gekichumai/dxrating-web test -- src/utils/__tests__/rating.test.ts
```

Expected: both commands PASS.

- [ ] **Step 7: Run web build**

Run:

```bash
pnpm --filter @gekichumai/dxrating-web build
```

Expected: build exits 0.

- [ ] **Step 8: Commit web rating migration**

Run:

```bash
git add apps/web/src/utils/rating.ts apps/web/src/components/rating/useRatingEntries.tsx apps/web/src/components/rating/RatingCalculatorAddEntryForm.tsx apps/web/src/utils/__tests__/rating.test.ts packages/maimai-domain
git commit -m "refactor: use shared best 50 in web"
```

---

### Task 7: Migrate Backend Oneshot Rating

**Files:**

- Modify: `apps/backend/src/services/functions/oneshot-renderer/index.tsx`
- Modify or Delete: `apps/backend/src/services/functions/oneshot-renderer/calculateRating.ts`
- Test: `apps/backend/src/test/oneshot.test.ts`

- [ ] **Step 1: Import shared Best 50 helpers**

In `apps/backend/src/services/functions/oneshot-renderer/index.tsx`, replace:

```ts
import { type Rating, calculateRating } from './calculateRating.js'
```

with:

```ts
import { calculateBest50, calculateRatingAward, type RatingAward } from '@gekichumai/maimai-domain'
```

Then update `RenderData`:

```ts
rating: RatingAward
```

- [ ] **Step 2: Use AP/AP+ flags in `enrichEntries`**

In `enrichEntries`, replace the rating calculation with:

```ts
rating: calculateRatingAward(
  entry.sheetOverrides?.internalLevelValue ?? sheet.internalLevelValue ?? 0,
  entry.achievementRate,
  entry.achievementAccuracy ?? null,
),
```

- [ ] **Step 3: Replace `calculateEntries` Best 50 splitting**

Replace the body of `calculateEntries` with:

```ts
const catalog = getDxdataSongCatalog(version)
const normalizedEntries = entries.flatMap((entry) => {
  const sheet = catalog.getById(entry.sheetId)
  if (!sheet) return []
  return [
    {
      sheetId: entry.sheetId,
      identity: sheet.identity,
      achievementRate: entry.achievementRate,
      comboFlag: entry.achievementAccuracy ?? null,
    },
  ]
})

const best50 = calculateBest50({
  catalog,
  version,
  region: '_generic',
  entries: normalizedEntries,
})

const byId = new Map(entries.map((entry) => [entry.sheetId, entry]))
const renderEntry = (entry: (typeof best50.b15)[number]): RenderData | null => {
  const original = byId.get(entry.entry.sheetId)
  if (!original) return null
  return enrichEntries([original], version)[0] ?? null
}

return {
  b15: best50.b15.map(renderEntry).filter((entry): entry is RenderData => !!entry),
  b35: best50.b35.map(renderEntry).filter((entry): entry is RenderData => !!entry),
}
```

Pass `region` through `calculateEntries` by changing its signature to:

```ts
const calculateEntries = (entries: PlayEntry[], version: VersionEnum, region: Region): { b15: RenderData[]; b35: RenderData[] } => {
```

Update both call sites from:

```ts
calculateEntries(body.entries ?? [], version)
```

to:

```ts
calculateEntries(body.entries ?? [], version, region)
```

- [ ] **Step 4: Preserve pre-calculated bucket behavior**

Keep `prepareCalculatedEntries` as the path for `body.calculatedEntries`, but make sure it uses the shared `enrichEntries` from Step 2. Do not route pre-calculated buckets back through `calculateBest50`, because callers have already selected the buckets.

- [ ] **Step 5: Remove local rating implementation**

Delete `apps/backend/src/services/functions/oneshot-renderer/calculateRating.ts` if no imports remain:

```bash
rg "calculateRating" apps/backend/src/services/functions/oneshot-renderer
```

Expected: no remaining import of `./calculateRating.js`.

- [ ] **Step 6: Run backend checks**

Run:

```bash
pnpm --filter @gekichumai/backend build
pnpm --filter @gekichumai/backend test -- src/test/oneshot.test.ts
```

Expected: build exits 0 and oneshot tests PASS. If backend tests require PostgreSQL for unrelated setup, run `pnpm --filter @gekichumai/backend db:up` before the test command.

- [ ] **Step 7: Commit backend oneshot migration**

Run:

```bash
git add apps/backend/src/services/functions/oneshot-renderer packages/maimai-domain
git commit -m "refactor: use shared rating in oneshot"
```

---

### Task 8: Implement Rating Import Normalizers

**Files:**

- Create: `packages/maimai-domain/src/import-normalizers.ts`
- Modify: `packages/maimai-domain/index.ts`
- Test: `packages/maimai-domain/src/__tests__/import-normalizers.test.ts`

- [ ] **Step 1: Write failing import normalizer tests**

Create `packages/maimai-domain/src/__tests__/import-normalizers.test.ts`:

```ts
import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  normalizeAquaDxRows,
  normalizeAquaSqliteRows,
  normalizeDivingFishRows,
  normalizeLxnsScores,
  normalizeMaimaiNetRecords,
  normalizeMuNetRows,
} from '../import-normalizers'
import { buildSongCatalog } from '../song-catalog'

const data: DXData = {
  updateTime: '2026-05-17T00:00:00.000Z',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  regions: [],
  songs: [
    {
      songId: 'Song A',
      title: 'Song A',
      artist: 'Artist',
      bpm: 120,
      category: CategoryEnum.Maimai,
      imageName: 'song-a',
      isNew: false,
      isLocked: false,
      searchAcronyms: [],
      sheets: [
        {
          internalId: 10001,
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13',
          internalLevelValue: 13,
          noteDesigner: null,
          noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
          regions: { jp: true, intl: true, cn: true },
          isSpecial: false,
          version: VersionEnum.CiRCLEPLUS,
        },
      ],
    },
  ],
}

const catalog = buildSongCatalog(data, VersionEnum.CiRCLEPLUS)

describe('Rating Import normalizers', () => {
  it('normalizes LXNS scores and warns on UTAGE or missing sheets', () => {
    const result = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'ap',
        fs: 'fsdp',
        type: 'dx',
        dxScore: 1000,
      },
      {
        id: 2,
        songName: 'Missing',
        level: '13',
        levelIndex: 3,
        achievements: 99,
        fc: null,
        fs: null,
        type: 'dx',
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].sheetId).toBe('Song A__dxrt__dx__dxrt__master')
    expect(result.entries[0].comboFlag).toBe('ap')
    expect(result.entries[0].syncFlag).toBe('fsdp')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('sheet-not-found')
  })

  it('dedupes by Sheet Identity and keeps highest achievement', () => {
    const result = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 990000, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1005000, dxScore: { achieved: 1, total: 2 }, flags: ['allPerfect'] },
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].achievementRate).toBe(100.5)
    expect(result.entries[0].comboFlag).toBe('ap')
  })

  it('keeps Diving Fish Best 50 Bucket hints', () => {
    const result = normalizeDivingFishRows(catalog, [
      {
        bucket: 'b15',
        achievements: 100.5,
        fc: 'ap',
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
      },
    ])

    expect(result.entries[0].source?.best50Bucket).toBe('b15')
  })

  it('normalizes AquaDX rows through provider music id maps', () => {
    const result = normalizeAquaDxRows(
      catalog,
      [{ musicId: '10001', level: 3, achievement: 1005000 }],
      { '10001': { name: 'Song A' } },
    )

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].achievementRate).toBe(100.5)
  })

  it('normalizes MuNET rows through zero-based level indexes', () => {
    const result = normalizeMuNetRows(
      catalog,
      [{ musicId: 10001, level: 3, achievement: 1005000 }],
      { '10001': { name: 'Song A' } },
    )

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].identity.difficulty).toBe(DifficultyEnum.Master)
  })

  it('normalizes Aqua SQLite rows by selected user and internal id', () => {
    const result = normalizeAquaSqliteRows(catalog, {
      selectedUserId: 10,
      gameplays: [
        {
          id: 1,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 1005000,
          user_id: 10,
          type: TypeEnum.DX,
        },
        {
          id: 2,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 990000,
          user_id: 11,
          type: TypeEnum.DX,
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].achievementRate).toBe(100.5)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/import-normalizers.test.ts
```

Expected: FAIL because `../import-normalizers` does not exist.

- [ ] **Step 3: Implement import normalizers**

Create `packages/maimai-domain/src/import-normalizers.ts`:

```ts
import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SongCatalog } from './song-catalog'
import type { Best50Bucket, ComboFlag, ImportProvider, ImportWarning, ProviderMusicIdMap, RatingEntry, SyncFlag } from './types'

export interface RatingImportResult {
  entries: RatingEntry[]
  warnings: ImportWarning[]
}

const LEVEL_INDEX_TO_DIFFICULTY: Record<number, DifficultyEnum> = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

const AQUA_DX_LEVEL_TO_DIFFICULTY: Record<number, DifficultyEnum> = {
  1: DifficultyEnum.Basic,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

export interface LxnsScoreRow {
  id: number
  songName: string
  level: string
  levelIndex: number
  achievements: number
  fc: string | null
  fs: string | null
  type: string
  dxScore?: number
}

export function normalizeLxnsScores(catalog: SongCatalog, rows: LxnsScoreRow[]): RatingImportResult {
  return finalizeImport(
    'lxns',
    rows.map((row) => {
      if (row.type === 'utage') return missing('lxns', row, 'sheet-not-found', `UTAGE score is not rating eligible: ${row.songName}`)
      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.levelIndex]
      if (!difficulty) return missing('lxns', row, 'invalid-difficulty', `Unknown LXNS level index: ${row.levelIndex}`)
      const type = row.type === 'standard' ? TypeEnum.STD : row.type === 'dx' ? TypeEnum.DX : null
      if (!type) return missing('lxns', row, 'invalid-type', `Unknown LXNS chart type: ${row.type}`)
      const sheet = catalog.resolveReference({ kind: 'title', title: row.songName, type, difficulty })
      if (!sheet) return missing('lxns', row, 'sheet-not-found', `No sheet found for ${row.songName}`)
      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: row.achievements,
          comboFlag: normalizeCombo(row.fc),
          syncFlag: normalizeSync(row.fs),
          source: { provider: 'lxns', providerId: row.id, providerSongName: row.songName },
        },
      }
    }),
  )
}

export interface MaimaiNetRecordRow {
  sheet: { songId: string; type: string; difficulty: string }
  achievement: { rate: number; dxScore: { achieved: number; total: number }; flags: string[] }
}

export function normalizeMaimaiNetRecords(catalog: SongCatalog, rows: MaimaiNetRecordRow[]): RatingImportResult {
  return finalizeImport(
    'maimai-net',
    rows.map((row) => {
      const type = row.sheet.type === 'standard' ? TypeEnum.STD : row.sheet.type === 'dx' ? TypeEnum.DX : null
      const difficulty = Object.values(DifficultyEnum).includes(row.sheet.difficulty as DifficultyEnum)
        ? (row.sheet.difficulty as DifficultyEnum)
        : null
      if (!type) return missing('maimai-net', row, 'invalid-type', `Unknown MaimaiNET chart type: ${row.sheet.type}`)
      if (!difficulty) return missing('maimai-net', row, 'invalid-difficulty', `Unknown MaimaiNET difficulty: ${row.sheet.difficulty}`)
      const sheet = catalog.resolveReference({ kind: 'identity', identity: { songId: row.sheet.songId, type, difficulty } })
      if (!sheet) return missing('maimai-net', row, 'sheet-not-found', `No sheet found for ${row.sheet.songId}`)
      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: row.achievement.rate / 10000,
          comboFlag: extractNetCombo(row.achievement.flags),
          syncFlag: extractNetSync(row.achievement.flags),
          source: { provider: 'maimai-net', providerSongName: row.sheet.songId },
        },
      }
    }),
  )
}

export interface DivingFishRow {
  bucket: Best50Bucket
  achievements: number
  fc: string | null
  fs: string | null
  level_index: number
  title: string
  type: string
  song_id: number
}

export function normalizeDivingFishRows(catalog: SongCatalog, rows: DivingFishRow[]): RatingImportResult {
  return finalizeImport(
    'diving-fish',
    rows.map((row) => {
      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.level_index]
      const type = row.type.toLowerCase() === 'sd' ? TypeEnum.STD : row.type.toLowerCase() === 'dx' ? TypeEnum.DX : null
      if (!difficulty) return missing('diving-fish', row, 'invalid-difficulty', `Unknown Diving Fish level index: ${row.level_index}`)
      if (!type) return missing('diving-fish', row, 'invalid-type', `Unknown Diving Fish chart type: ${row.type}`)
      const sheet = catalog.resolveReference({ kind: 'title', title: row.title, type, difficulty })
      if (!sheet) return missing('diving-fish', row, 'sheet-not-found', `No sheet found for ${row.title}`)
      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: row.achievements,
          comboFlag: normalizeCombo(row.fc),
          syncFlag: normalizeSync(row.fs),
          source: { provider: 'diving-fish', providerId: row.song_id, providerSongName: row.title, best50Bucket: row.bucket },
        },
      }
    }),
  )
}

export interface AquaDxRow {
  musicId: string | number
  level: number
  achievement: number
}

export function normalizeAquaDxRows(catalog: SongCatalog, rows: AquaDxRow[], map: ProviderMusicIdMap): RatingImportResult {
  return finalizeImport(
    'aqua-dx',
    rows.map((row) => {
      const difficulty = AQUA_DX_LEVEL_TO_DIFFICULTY[row.level]
      if (!difficulty) return missing('aqua-dx', row, 'invalid-difficulty', `Unknown AquaDX level: ${row.level}`)
      const sheet = catalog.resolveReference({ kind: 'provider-music-id', musicId: row.musicId, difficulty, map })
      if (!sheet) return missing('aqua-dx', row, 'sheet-not-found', `No sheet found for AquaDX music id ${row.musicId}`)
      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: normalizeAchievement(row.achievement),
          source: { provider: 'aqua-dx', providerId: row.musicId },
        },
      }
    }),
  )
}

export interface MuNetRow {
  musicId: string | number
  level: number
  achievement: number
}

export function normalizeMuNetRows(catalog: SongCatalog, rows: MuNetRow[], map: ProviderMusicIdMap): RatingImportResult {
  return finalizeImport(
    'mu-net',
    rows.map((row) => {
      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.level]
      if (!difficulty) return missing('mu-net', row, 'invalid-difficulty', `Unknown MuNET level: ${row.level}`)
      const sheet = catalog.resolveReference({ kind: 'provider-music-id', musicId: row.musicId, difficulty, map })
      if (!sheet) return missing('mu-net', row, 'sheet-not-found', `No sheet found for MuNET music id ${row.musicId}`)
      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: normalizeAchievement(row.achievement),
          source: { provider: 'mu-net', providerId: row.musicId },
        },
      }
    }),
  )
}

export interface AquaSqliteGameplayRow {
  id: number
  music_id: number
  level: DifficultyEnum
  achievement: number
  user_id: number
  type: TypeEnum
}

export function normalizeAquaSqliteRows(
  catalog: SongCatalog,
  input: { selectedUserId: number; gameplays: AquaSqliteGameplayRow[] },
): RatingImportResult {
  return finalizeImport(
    'aqua-sqlite',
    input.gameplays
      .filter((row) => row.user_id === input.selectedUserId)
      .map((row) => {
        const sheet = catalog.resolveReference({
          kind: 'internal-id',
          internalId: row.music_id,
          type: row.type,
          difficulty: row.level,
        })
        if (!sheet) return missing('aqua-sqlite', row, 'sheet-not-found', `No sheet found for Aqua SQLite music id ${row.music_id}`)
        return {
          entry: {
            sheetId: sheet.id,
            identity: sheet.identity,
            achievementRate: normalizeAchievement(row.achievement),
            source: { provider: 'aqua-sqlite', providerId: row.music_id },
          },
        }
      }),
  )
}

function finalizeImport(provider: ImportProvider, results: Array<{ entry: RatingEntry } | { warning: ImportWarning }>): RatingImportResult {
  const warnings = results.flatMap((result) => ('warning' in result ? [result.warning] : []))
  const bySheetId = new Map<string, RatingEntry>()
  for (const result of results) {
    if (!('entry' in result)) continue
    const existing = bySheetId.get(result.entry.sheetId)
    if (!existing || result.entry.achievementRate > existing.achievementRate) {
      bySheetId.set(result.entry.sheetId, result.entry)
    }
  }
  return { entries: [...bySheetId.values()], warnings }
}

function missing(provider: ImportProvider, row: unknown, code: ImportWarning['code'], message: string): { warning: ImportWarning } {
  return { warning: { provider, code, message, row } }
}

function normalizeAchievement(value: number): number {
  return Number.isNaN(value) ? 0 : value / 10000
}

function normalizeCombo(value: string | null): ComboFlag {
  if (value === 'fc' || value === 'fcp' || value === 'ap' || value === 'app') return value
  return null
}

function normalizeSync(value: string | null): SyncFlag {
  if (value === 'fs' || value === 'fsp' || value === 'fsd' || value === 'fsdp' || value === 'sync') return value
  return null
}

function extractNetCombo(flags: string[]): ComboFlag {
  if (flags.includes('allPerfect+')) return 'app'
  if (flags.includes('allPerfect')) return 'ap'
  if (flags.includes('fullCombo+')) return 'fcp'
  if (flags.includes('fullCombo')) return 'fc'
  return null
}

function extractNetSync(flags: string[]): SyncFlag {
  if (flags.includes('fullSyncDX+')) return 'fsdp'
  if (flags.includes('fullSyncDX')) return 'fsd'
  if (flags.includes('fullSync+')) return 'fsp'
  if (flags.includes('fullSync')) return 'fs'
  if (flags.includes('syncPlay')) return 'sync'
  return null
}
```

- [ ] **Step 4: Export import normalizers**

Update `packages/maimai-domain/index.ts`:

```ts
export * from './src/best50'
export * from './src/dxdata-catalog'
export * from './src/import-normalizers'
export * from './src/sheet-identity'
export * from './src/song-catalog'
export * from './src/types'
```

- [ ] **Step 5: Run import normalizer tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test -- src/__tests__/import-normalizers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit import normalizers**

Run:

```bash
git add packages/maimai-domain
git commit -m "feat: add rating import normalizers"
```

---

### Task 9: Migrate Web Import Adapters

**Files:**

- Modify: `apps/web/src/components/rating/io/import/ImportFromDivingFishButtonListItem.tsx`
- Modify: `apps/web/src/components/rating/io/import/ImportFromLxnsButtonListItem.tsx`
- Modify: `apps/web/src/components/rating/io/import/importFromNETRecords.tsx`
- Modify: `apps/web/src/components/rating/io/import/ImportFromAquaDxButtonListItem.tsx`
- Modify: `apps/web/src/components/rating/io/import/ImportFromMuNetButtonListItem.tsx`
- Modify: `apps/web/src/components/rating/io/import/ImportFromAquaSQLiteListItem.tsx`

- [ ] **Step 1: Add Adapter conversion helper**

Create a small helper inside `apps/web/src/components/rating/io/import/importResultToPlayEntries.ts`:

```ts
import type { RatingImportResult } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export function importResultToPlayEntries(result: RatingImportResult): PlayEntry[] {
  return result.entries.map((entry) => ({
    sheetId: entry.sheetId,
    identity: entry.identity,
    achievementRate: entry.achievementRate,
    comboFlag: entry.comboFlag,
    syncFlag: entry.syncFlag,
    providerConfig:
      entry.source?.provider === 'diving-fish'
        ? {
            divingFish: {
              ratingEligibility: entry.source.best50Bucket ?? null,
            },
          }
        : undefined,
  }))
}
```

- [ ] **Step 2: Update LXNS Adapter**

In `ImportFromLxnsButtonListItem.tsx`, import:

```ts
import { getDxdataSongCatalog, normalizeLxnsScores } from '@gekichumai/maimai-domain'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { importResultToPlayEntries } from './importResultToPlayEntries'
```

Inside `LxnsImportDialogContent`, add:

```ts
const appVersion = useAppContextDXDataVersion()
```

Replace the manual `result.scores.filter(...).map(...).filter(...)` block with:

```ts
const importResult = normalizeLxnsScores(getDxdataSongCatalog(appVersion), result.scores)
const entries = importResultToPlayEntries(importResult)
for (const warning of importResult.warnings) {
  console.warn('[ImportFromLxnsButtonListItem]', warning.message, warning.row)
}
```

- [ ] **Step 3: Update MaimaiNET Adapter**

In `importFromNETRecords.tsx`, import:

```ts
import { getDxdataSongCatalog, normalizeMaimaiNetRecords } from '@gekichumai/maimai-domain'
import { importResultToPlayEntries } from './importResultToPlayEntries'
```

Change the `importFromNETRecords` signature to accept `appVersion: VersionEnum`:

```ts
export const importFromNETRecords = async (
  sheets: FlattenedSheet[],
  appVersion: VersionEnum,
  modifyEntries: ListActions<PlayEntry>,
  mode: 'merge' | 'replace',
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
) => {
```

Replace the manual `data.music.filter(...).map(...).filter(...)` block with:

```ts
const importResult = normalizeMaimaiNetRecords(getDxdataSongCatalog(appVersion), data.music)
const entries = importResultToPlayEntries(importResult)
for (const warning of importResult.warnings) {
  console.warn('[importFromNETRecords]', warning.message, warning.row)
}
```

Update the call site in `ImportFromNETRecordsListItem.tsx` to pass `useAppContextDXDataVersion()`.

- [ ] **Step 4: Update Diving Fish Adapter**

In `ImportFromDivingFishButtonListItem.tsx`, import:

```ts
import { getDxdataSongCatalog, normalizeDivingFishRows } from '@gekichumai/maimai-domain'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { importResultToPlayEntries } from './importResultToPlayEntries'
```

Pass `appVersion` from `ImportDivingFishDialogContent` into `fetchDivingFish`.

Replace manual `entries.push(...data.charts.dx...)` and `entries.push(...data.charts.sd...)` with:

```ts
const importResult = normalizeDivingFishRows(getDxdataSongCatalog(appVersion), [
  ...data.charts.dx.map((row) => ({ ...row, bucket: 'b15' as const })),
  ...data.charts.sd.map((row) => ({ ...row, bucket: 'b35' as const })),
])
const entries = importResultToPlayEntries(importResult)
for (const warning of importResult.warnings) {
  console.warn('[ImportFromDivingFishButtonListItem]', warning.message, warning.row)
}
```

- [ ] **Step 5: Update AquaDX and MuNET Adapters**

In `ImportFromAquaDxButtonListItem.tsx` and `ImportFromMuNetButtonListItem.tsx`, import:

```ts
import { getDxdataSongCatalog, normalizeAquaDxRows, normalizeMuNetRows } from '@gekichumai/maimai-domain'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { importResultToPlayEntries } from './importResultToPlayEntries'
```

Convert parsed rows to `{ musicId, level, achievement }[]`, call:

```ts
const importResult = normalizeAquaDxRows(getDxdataSongCatalog(appVersion), rows, musicIdMap)
const entries = importResultToPlayEntries(importResult)
```

For MuNET, pass zero-based levels to `normalizeMuNetRows`:

```ts
const rows = muNetData.userMusicDetailList.map((row) => ({
  musicId: row.musicId,
  level: row.level,
  achievement: row.achievement,
}))
const importResult = normalizeMuNetRows(getDxdataSongCatalog(appVersion), rows, musicIdMap)
```

- [ ] **Step 6: Keep Aqua SQLite database reading local**

In `ImportFromAquaSQLiteListItem.tsx`, leave `readAquaUsers`, `readAquaGamePlays`, and `readAquaPlayLogs` in `apps/web/src/utils/aquaDB.ts`. Replace the local `getUserGamePlays` matching/dedupe logic with `normalizeAquaSqliteRows`.

Use the same pattern as the other Adapters:

```ts
const importResult = normalizeAquaSqliteRows(getDxdataSongCatalog(appVersion), {
  selectedUserId: selectedUser.id,
  gameplays,
  playLogs,
})
const entries = importResultToPlayEntries(importResult)
```

- [ ] **Step 7: Run web import checks**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test
pnpm --filter @gekichumai/dxrating-web build
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit web import migration**

Run:

```bash
git add apps/web/src/components/rating/io/import apps/web/src/utils/aquaDB.ts packages/maimai-domain
git commit -m "refactor: normalize rating imports in shared package"
```

---

### Task 10: Final Cleanup and Verification

**Files:**

- Modify: duplicate code removed from web/backend after migration.
- Verify: root lint, format check, build.

- [ ] **Step 1: Search for duplicate Sheet Identity separators**

Run:

```bash
rg "__dxrt__|CANONICAL_ID_PARTS_SEPARATOR" apps packages scripts
```

Expected: only `packages/maimai-domain/src/sheet-identity.ts` and tests contain `__dxrt__`.

- [ ] **Step 2: Search for duplicate rating coefficient tables**

Run:

```bash
rg "SCORE_COEFFICIENT_TABLE|calculateRating" apps packages
```

Expected: coefficient table is defined in `packages/maimai-domain/src/best50.ts`; app files only import or re-export shared helpers.

- [ ] **Step 3: Run package tests**

Run:

```bash
pnpm --filter @gekichumai/maimai-domain test
```

Expected: all package tests PASS.

- [ ] **Step 4: Run app builds**

Run:

```bash
pnpm --filter @gekichumai/dxrating-web build
pnpm --filter @gekichumai/backend build
```

Expected: both builds exit 0.

- [ ] **Step 5: Run root checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit cleanup**

Run:

```bash
git add apps packages pnpm-lock.yaml
git commit -m "chore: finish maimai domain migration"
```
