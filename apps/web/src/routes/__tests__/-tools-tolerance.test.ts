import { describe, expect, it } from 'vitest'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { buildSheetTolerancePath } from '@/components/sheet/sheetLinks'
import { loadToleranceSheet, toToleranceSheet, validateToleranceSearch } from '../tools/tolerance'

describe('/tools/tolerance', () => {
  it('only accepts public sheet IDs', () => {
    expect(validateToleranceSearch({ sheet: 'dsht_abc123' })).toEqual({ sheet: 'dsht_abc123' })
    expect(validateToleranceSearch({ sheet: '<script>' })).toEqual({ sheet: undefined })
    expect(validateToleranceSearch({ sheet: 42 })).toEqual({ sheet: undefined })
  })

  it('resolves the selected sheet from the catalog for SSR', async () => {
    const document = await getCatalogDocument()
    const song = document.songs.find((s) => s.sheets.some((sheet) => sheet.noteCounts?.tap !== undefined))!
    const sheet = song.sheets.find((s) => s.noteCounts?.tap !== undefined)!
    const loaded = await loadToleranceSheet(sheet.id)
    expect(loaded).toMatchObject({ id: sheet.id, songId: song.id, title: song.title, type: sheet.type })
    expect(await loadToleranceSheet('dsht_doesnotexist')).toBeNull()
    expect(await loadToleranceSheet(undefined)).toBeNull()
  })
})

describe('/songs/$songId/$type/$difficulty/tolerance', () => {
  it('is the path the picker and the chart page link to', () => {
    expect(buildSheetTolerancePath({ songId: 'dsng_abc', type: 'dx', difficulty: 'master' })).toBe(
      '/songs/dsng_abc/dx/master/tolerance',
    )
  })

  it('builds the calculator sheet from the catalog song', async () => {
    const document = await getCatalogDocument()
    const song = document.songs[0]!
    const sheet = song.sheets[0]!
    expect(toToleranceSheet(song, sheet)).toEqual({
      id: sheet.id,
      songId: song.id,
      title: song.title,
      imageName: song.imageName,
      type: sheet.type,
      difficulty: sheet.difficulty,
      internalLevelValue: sheet.internalLevelValue,
      noteCounts: sheet.noteCounts,
    })
  })
})