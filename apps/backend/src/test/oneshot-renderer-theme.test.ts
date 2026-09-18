import { renderAsync } from '@resvg/resvg-js'
import { VersionEnum } from '@gekichumai/dxdata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchImageAsset } from '../services/functions/oneshot-renderer/assetFetcher.js'
import { MAGICAL_BACKGROUND_SVG } from '../services/functions/oneshot-renderer/magicalBackground.generated.js'
import { renderContent } from '../services/functions/oneshot-renderer/renderContent.js'

vi.mock('../services/functions/oneshot-renderer/assetFetcher.js', () => ({
  fetchImageAsset: vi.fn(async () => Buffer.from('synthetic image')),
}))

describe('oneshot renderer version themes', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(Object.values(VersionEnum))('renders content for accepted version %s', async (version) => {
    await expect(renderContent({ data: { b15: [], b35: [] }, version, region: 'jp' })).resolves.toBeDefined()
  })

  it('renders MAGiCAL with bundled artwork without requesting a remote background', async () => {
    const content = await renderContent({ data: { b15: [], b35: [] }, version: VersionEnum.MAGiCAL, region: 'jp' })

    expect(JSON.stringify(content)).toContain(VersionEnum.MAGiCAL)

    expect(fetchImageAsset).not.toHaveBeenCalledWith(expect.stringContaining('/images/background/'))
    const image = await renderAsync(MAGICAL_BACKGROUND_SVG)
    expect(image.width).toBe(1500)
    expect(image.height).toBe(1300)
    expect(image.pixels.some((channel, i) => i % 4 === 3 && channel > 0)).toBe(true)
  })

  it('preserves the selected artwork for versions with renderer themes', async () => {
    await renderContent({ data: { b15: [], b35: [] }, version: VersionEnum.PRiSM, region: 'cn' })

    expect(fetchImageAsset).toHaveBeenCalledWith('/images/background/prism.jpg')
  })
})