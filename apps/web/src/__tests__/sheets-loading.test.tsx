import { VersionEnum } from '@gekichumai/dxdata'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { renderToString } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CombinedTags } from '../models/useCombinedTags'
import { getFlattenedSheetsForVersion, useSheets, useSongs, type ServerAlias } from '../songs'

const state = vi.hoisted(() => ({
  version: 'MAGiCAL' as string,
  tags: undefined as CombinedTags | undefined,
  aliases: undefined as ServerAlias[] | undefined,
  loadingTags: true,
  loadingAliases: true,
}))
vi.mock('../models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => state.version,
  useAppContext: () => ({ version: state.version }),
}))
vi.mock('../models/useCombinedTags', () => ({
  useCombinedTags: () => ({ data: state.tags, isLoading: state.loadingTags }),
}))
vi.mock('../models/useServerAliases', () => ({
  useServerAliases: () => ({ data: state.aliases, isLoading: state.loadingAliases }),
}))

function wrapper({ children }: PropsWithChildren) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  state.version = VersionEnum.MAGiCAL
  state.tags = undefined
  state.aliases = undefined
  state.loadingTags = true
  state.loadingAliases = true
})
afterEach(cleanup)

const tagsFor = (tagId: number): CombinedTags => {
  const sheet = getFlattenedSheetsForVersion(VersionEnum.MAGiCAL)[0]!
  return {
    tags: [],
    tagGroups: [],
    tagSongs: [{ song_id: sheet.songId, sheet_type: sheet.type, sheet_difficulty: sheet.difficulty, tag_id: tagId }],
  } as CombinedTags
}

describe('sheet catalog availability', () => {
  it('renders bundled songs and charts immediately, including on the server', () => {
    const { result } = renderHook(() => ({ sheets: useSheets(), songs: useSongs() }), { wrapper })
    expect(result.current.sheets.data?.length).toBeGreaterThan(0)
    expect(result.current.songs.data?.length).toBeGreaterThan(0)
    function ServerCatalog() {
      const { data } = useSheets()
      return <output>{data?.length ?? 'missing'}</output>
    }
    expect(renderToString(<ServerCatalog />)).not.toContain('missing')
  })

  it('never clears existing sheets when tags and aliases arrive independently', async () => {
    const snapshots: Array<number | undefined> = []
    const { result, rerender } = renderHook(
      () => {
        const sheets = useSheets()
        snapshots.push(sheets.data?.length)
        return sheets
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
    snapshots.length = 0
    state.tags = tagsFor(11)
    state.loadingTags = false
    rerender()
    await act(async () => {})
    state.aliases = [{ song_id: result.current.data![0]!.songId, name: 'new alias' }]
    state.loadingAliases = false
    rerender()
    await act(async () => {})
    expect(snapshots.every((count) => count !== undefined && count > 0)).toBe(true)
    expect(result.current.data![0]!.tags).toEqual([11])
    expect(result.current.data![0]!.searchAcronyms).toContain('new alias')
  })

  it('applies same-count metadata edits and aliases arriving before tags', async () => {
    const songId = getFlattenedSheetsForVersion(VersionEnum.MAGiCAL)[0]!.songId
    state.aliases = [{ song_id: songId, name: 'first alias' }]
    state.loadingAliases = false
    const { result, rerender } = renderHook(() => useSheets(), { wrapper })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
    expect(result.current.data![0]!.searchAcronyms).toContain('first alias')
    state.tags = tagsFor(11)
    state.loadingTags = false
    rerender()
    await waitFor(() => expect(result.current.data?.[0]?.tags).toEqual([11]))
    state.tags = tagsFor(22)
    state.aliases = [{ song_id: songId, name: 'replacement alias' }]
    rerender()
    await act(async () => {})
    expect(result.current.data![0]!.tags).toEqual([22])
    expect(result.current.data![0]!.searchAcronyms).toContain('replacement alias')
    expect(result.current.data![0]!.searchAcronyms).not.toContain('first alias')
  })

  it('refreshes edits and removals even when metadata collection sizes stay the same', async () => {
    const songId = getFlattenedSheetsForVersion(VersionEnum.MAGiCAL)[0]!.songId
    state.tags = tagsFor(11)
    state.aliases = [{ song_id: songId, name: 'old alias' }]
    state.loadingTags = false
    state.loadingAliases = false
    const { result, rerender } = renderHook(() => useSheets(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0]?.tags).toEqual([11]))
    state.tags = tagsFor(22)
    state.aliases = [{ song_id: songId, name: 'edited alias' }]
    rerender()
    expect(result.current.data[0]!.tags).toEqual([22])
    expect(result.current.data[0]!.searchAcronyms).toContain('edited alias')
    expect(result.current.data[0]!.searchAcronyms).not.toContain('old alias')
    state.tags = { tags: [], tagGroups: [], tagSongs: [] }
    state.aliases = []
    rerender()
    expect(result.current.data[0]!.tags).toEqual([])
    expect(result.current.data[0]!.searchAcronyms).not.toContain('edited alias')
  })

  it('switches directly to the selected version without retaining a stale catalog', async () => {
    const { result, rerender } = renderHook(() => useSheets(), { wrapper })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
    state.version = VersionEnum.CiRCLEPLUS
    rerender()
    expect(result.current.data?.map((sheet) => sheet.internalLevelValue)).toEqual(
      getFlattenedSheetsForVersion(VersionEnum.CiRCLEPLUS).map((sheet) => sheet.internalLevelValue),
    )
  })
})