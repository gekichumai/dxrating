import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
  createChartOgImageHandler,
  formatInternalLevelLabelParts,
  getTitleLayout,
} from '../services/functions/chart-og-image/index.js'

const song = dxdata.songs.find((candidate) =>
  candidate.sheets.some((sheet) => sheet.type === TypeEnum.DX && sheet.difficulty === DifficultyEnum.Master),
)

if (!song) throw new Error('Expected fixture song with a DX Master chart')

const sheet = song.sheets.find(
  (candidate) => candidate.type === TypeEnum.DX && candidate.difficulty === DifficultyEnum.Master,
)

if (!sheet) throw new Error('Expected fixture song to include selected sheet')

describe('chart OG image handler', () => {
  it('resolves chart data and returns a cacheable PNG response', async () => {
    const image = new Uint8Array([137, 80, 78, 71])
    const renderImage = vi.fn(async () => image)
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(renderImage))

    const res = await app.request(`/og/${encodeURIComponent(song.songId)}/${sheet.type}/${sheet.difficulty}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(await res.arrayBuffer()).toEqual(image.buffer)
    expect(renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: song.artist,
        coverUrl: `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`,
        detailUrl: `https://dxrating.net/songs/${encodeURIComponent(song.songId)}/${sheet.type}/${sheet.difficulty}`,
        difficulty: sheet.difficulty,
        levelLabel: `Lv ${sheet.internalLevelValue.toFixed(1)}`,
        level: sheet.level,
        songId: song.songId,
        title: song.title,
        type: sheet.type,
      }),
    )
  })

  it('returns 404 without rendering when the chart does not exist', async () => {
    const renderImage = vi.fn(async () => new Uint8Array([1]))
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(renderImage))

    const res = await app.request(
      `/og/${encodeURIComponent(song.songId)}/${TypeEnum.DX}/${DifficultyEnum.Basic}-missing`,
    )

    expect(res.status).toBe(404)
    expect(renderImage).not.toHaveBeenCalled()
  })
})

describe('chart OG image level label', () => {
  it('splits the decimal part for separate visual emphasis', () => {
    expect(formatInternalLevelLabelParts(12)).toEqual({ prefix: 'Lv ', integer: '12', fraction: '.0' })
    expect(formatInternalLevelLabelParts(13.7)).toEqual({ prefix: 'Lv ', integer: '13', fraction: '.7' })
  })
})

describe('chart OG image title layout', () => {
  it('uses a compact layout for the longest song title in dxdata', () => {
    const [longestSong] = [...dxdata.songs].sort((a, b) => b.title.length - a.title.length)

    expect(longestSong.title).toBe(
      'False Amber (from the Black Bazaar, Or by A Kervan Trader from the Lands Afar, Or Buried Beneath the Shifting Sands That Lead Everywhere but Nowhere)',
    )
    expect(getTitleLayout(longestSong.title)).toEqual({ fontSize: 25, lineHeight: 1.1, maxHeight: 150 })
  })
})