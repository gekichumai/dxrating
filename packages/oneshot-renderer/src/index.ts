import { renderAsync } from '@resvg/resvg-js'
import satori, { type Font } from 'satori'
import sharp from 'sharp'
import { renderContent } from './renderContent.js'
import { ONESHOT_WIDTH, ONESHOT_HEIGHT, normalizeWidth } from './dimensions.js'
import type { LoadAsset, RenderInput, RenderOptions, RenderResult, RenderStage } from './types.js'

export type * from './types.js'
export { createAssetLoader } from './assets.js'
export { createRenderService, RenderQueueFullError } from './service.js'
export { VERSION_THEME } from './renderContent.js'
export { ONESHOT_WIDTH, ONESHOT_HEIGHT, normalizeWidth } from './dimensions.js'

export const FONT_CONFIG = [
  { name: 'NewRodinProDB', file: 'NewRodinProDB.otf', weight: 400 },
  { name: 'SeuratProDB', file: 'SeuratProDB.otf', weight: 400 },
  { name: 'Source Han Sans', file: 'SourceHanSansJP-Regular.otf', weight: 400 },
  { name: 'Source Han Sans', file: 'SourceHanSansJP-Medium.otf', weight: 500 },
  { name: 'Source Han Sans', file: 'SourceHanSansJP-Bold.otf', weight: 700 },
] as const

const tailwindConfig = {
  theme: {
    fontFamily: {
      sans: 'Source Han Sans, sans-serif',
      newrodin: 'NewRodinProDB, sans-serif',
      seurat: 'SeuratProDB, sans-serif',
    },
  },
}

/** Create once per asset source so Satori can reuse the same parsed font objects. */
export function createOneshotRenderer({
  loadAsset,
  loadImage = loadAsset,
  revision = 'unknown',
}: {
  loadAsset: LoadAsset
  loadImage?: LoadAsset
  revision?: string
}) {
  let fonts: Promise<Font[]> | undefined
  const loadFonts = () => {
    fonts ??= Promise.all(
      FONT_CONFIG.map(async ({ name, file, weight }) => ({
        name,
        data: await loadAsset(`/fonts/${file}`),
        weight,
        style: 'normal' as const,
      })),
    ).catch((error: unknown) => {
      fonts = undefined
      throw error
    })
    return fonts
  }

  return async (input: RenderInput, options: RenderOptions = {}): Promise<RenderResult> => {
    const timings: RenderResult['timings'] = {}
    const measure = async <T>(stage: RenderStage, work: () => Promise<T>): Promise<T> => {
      const start = performance.now()
      try {
        return await work()
      } finally {
        timings[stage] = performance.now() - start
      }
    }
    const fontPack = await measure('font', loadFonts)
    const content = await measure('jsx', () => renderContent(input, loadImage, revision))
    const svg = await measure('satori', () =>
      satori(content, {
        width: ONESHOT_WIDTH,
        height: ONESHOT_HEIGHT,
        fonts: fontPack,
        // Keep glyph outlines in the scene: no OS font discovery or second text-layout pass.
        embedFont: true,
        tailwindConfig,
      }),
    )
    if (!options.format || options.format === 'svg') {
      return { body: svg, contentType: 'image/svg+xml', timings }
    }

    const rendered = await measure('resvg', () =>
      renderAsync(svg, {
        font: { loadSystemFonts: false },
        languages: ['en', 'ja'],
        shapeRendering: 2,
        textRendering: 2,
        imageRendering: 0,
        fitTo: { mode: 'width', value: normalizeWidth(options.width) },
      }),
    )
    const buffer = await measure('result_buffer', () => {
      const encoder = sharp(rendered.pixels, {
        raw: { width: rendered.width, height: rendered.height, channels: 4 },
      })
      return options.format === 'png'
        ? encoder.png().toBuffer()
        : encoder.jpeg({ quality: 90, progressive: true }).toBuffer()
    })
    return {
      // A Buffer can be a view into a larger slab. Expose only this image's bytes.
      body: new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength),
      contentType: options.format === 'png' ? 'image/png' : 'image/jpeg',
      timings,
    }
  }
}