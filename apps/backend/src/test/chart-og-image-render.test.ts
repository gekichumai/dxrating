import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { publishedCatalog, UMIYURI } from '../services/mcp/test-fixture'
import {
  renderChartOgImageEffect,
  resolveChartOgImageData,
  resolveSongOgImageData,
  renderSongOgImageEffect,
} from '../services/functions/chart-og-image/index'

const song = publishedCatalog.songs.find((candidate) => candidate.id === UMIYURI)!
const sheet = song.sheets.find((candidate) => candidate.type === 'std' && candidate.difficulty === 'master')!
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

// The native renderer needs the fonts of the asset server. CI has no local copy and downloading them made the endpoint
// tests flaky, so this runs only with ASSETS_BASE_DIR pointing at the assets (as for the oneshot visual checks).
describe.runIf(process.env.ASSETS_BASE_DIR)('chart OG image rendering with the real assets', () => {
  it('renders a chart card and a song card as PNG', async () => {
    const chart = resolveChartOgImageData(song, sheet.type, sheet.difficulty)!
    const songData = resolveSongOgImageData(song)!

    const [chartImage, songImage] = await Promise.all([
      Effect.runPromise(renderChartOgImageEffect(chart, 'ja')),
      Effect.runPromise(renderSongOgImageEffect(songData, 'zh-Hans')),
    ])

    expect([...chartImage.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    expect([...songImage.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
  })
})