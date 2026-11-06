import { describe, expect, it } from 'vitest'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { loadToleranceSheet, validateToleranceSearch } from '../tools/tolerance'

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