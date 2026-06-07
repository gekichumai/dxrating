import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'
import {
  createChartOgImageHandler,
  formatInternalLevelLabelParts,
  getTitleLayout,
  resolveChartOgImageData,
} from '../services/functions/chart-og-image/index.js'

const song = dxdata.songs.find((candidate) =>
  candidate.sheets.some((sheet) => sheet.type === TypeEnum.DX && sheet.difficulty === DifficultyEnum.Master),
)

if (!song) throw new Error('Expected fixture song with a DX Master chart')

const sheet = song.sheets.find(
  (candidate) => candidate.type === TypeEnum.DX && candidate.difficulty === DifficultyEnum.Master,
)

if (!sheet) throw new Error('Expected fixture song to include selected sheet')

const utageSongId = '[宴]セガサターン起動音[H.][Remix]'

describe('chart OG image handler', () => {
  it('serves chart images from the API v1 endpoint format', async () => {
    const res = await app.request(
      `/api/v1/songs/${encodeURIComponent(song.songId)}/${sheet.type}/${sheet.difficulty}/og-image`,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="chart-og.png"; filename*=utf-8\'\'chart-og.png',
    )
    expect(res.headers.get('etag')).toMatch(/^"sha256-[a-f0-9]{64}"$/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('serves Utage chart images with custom difficulty labels from the API v1 endpoint format', async () => {
    const res = await app.request(
      `/api/v1/songs/${encodeURIComponent(utageSongId)}/${TypeEnum.UTAGE}/${encodeURIComponent('【宴】')}/og-image`,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('keeps the internal chart image endpoint out of the OpenAPI spec', async () => {
    const res = await app.request('/spec.json')
    const spec = await res.json()

    expect(spec.paths).not.toHaveProperty('/songs/{songId}/{type}/{difficulty}/og-image')
  })

  it('resolves chart data and returns a cacheable PNG response', async () => {
    const image = new Uint8Array([137, 80, 78, 71])
    const renderImage = vi.fn(async () => image)
    const app = new Hono()
    app.get('/og/:songId/:type/:difficulty', createChartOgImageHandler(renderImage))

    const res = await app.request(`/og/${encodeURIComponent(song.songId)}/${sheet.type}/${sheet.difficulty}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="chart-og.png"; filename*=utf-8\'\'chart-og.png',
    )
    expect(res.headers.get('etag')).toBe('"sha256-0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543"')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
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

describe('chart OG image data resolution', () => {
  it('supports Utage charts with custom difficulty labels', () => {
    const data = resolveChartOgImageData(utageSongId, TypeEnum.UTAGE, '【宴】')

    expect(data).toMatchObject({
      detailUrl: `https://dxrating.net/songs/${encodeURIComponent(utageSongId)}/${TypeEnum.UTAGE}/${encodeURIComponent('【宴】')}`,
      difficulty: '【宴】',
      difficultyLabel: '【宴】',
      level: '13+?',
      levelLabel: 'Lv 13.6',
      songId: utageSongId,
      title: utageSongId,
      type: TypeEnum.UTAGE,
      typeLabel: 'Utage',
    })
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