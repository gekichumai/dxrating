import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { buildCatalogSlice, toCatalogMeta } from '@/catalog/catalogSource'
import { SHEET_LIST_FIRST_SCREEN_ROWS } from '@/components/sheet/SheetListContainer'
import { getSheetListFirstScreen, getSheetListFirstScreenSongs } from '../SheetList'

describe('home page catalog slice', () => {
  it('holds the songs of the first rows of the default list, and renders those rows in the same order', () => {
    const songs = getSheetListFirstScreenSongs(catalogSnapshot)
    const slice = buildCatalogSlice(toCatalogMeta(catalogSnapshot), songs)

    const fullRows = getSheetListFirstScreen(catalogSnapshot)
    expect(fullRows).toHaveLength(SHEET_LIST_FIRST_SCREEN_ROWS)
    expect(getSheetListFirstScreen(slice).map((row) => row.id)).toEqual(fullRows.map((row) => row.id))
    // a few songs, not the catalog
    expect(songs.length).toBeLessThanOrEqual(SHEET_LIST_FIRST_SCREEN_ROWS)
  })
})