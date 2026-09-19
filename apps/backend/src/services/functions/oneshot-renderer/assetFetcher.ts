import { createAssetLoader } from '@gekichumai/oneshot-renderer'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { Sentry } from '../../../lib/functions/sentry.js'

export const getAssetSourceKey = () =>
  JSON.stringify({
    baseDir: process.env.ASSETS_BASE_DIR,
    cacheDir: process.env.ASSETS_LOCAL_CACHE_DIR || path.join(os.tmpdir(), 'dxrating-assets'),
    remoteUrl: process.env.ASSETS_REMOTE_URL || 'https://shama.dxrating.net',
  })

let source: string | undefined
let loader: ReturnType<typeof createAssetLoader> | undefined

let fallbackImageBuffer: Buffer | undefined

async function getFallbackImage(): Promise<Buffer> {
  if (!fallbackImageBuffer) {
    fallbackImageBuffer = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
    })
      .png()
      .toBuffer()
  }
  return fallbackImageBuffer
}

/**
 * Fetches an image asset, returning a gray 1x1 PNG fallback on failure.
 */
export async function fetchImageAsset(relativePath: string): Promise<Buffer> {
  try {
    return await fetchAsset(relativePath)
  } catch (error) {
    console.warn(`Image asset not found, using gray fallback: ${relativePath}`)
    Sentry.captureException(error, { level: 'warning', extra: { relativePath } })
    return getFallbackImage()
  }
}

export async function fetchAsset(relativePath: string): Promise<Buffer> {
  const currentSource = getAssetSourceKey()
  if (!loader || source !== currentSource) {
    source = currentSource
    loader = createAssetLoader({
      ...JSON.parse(currentSource),
      onCacheError: (error, relativePath) => {
        Sentry.captureException(error, { extra: { relativePath } })
      },
    })
  }
  return loader(relativePath)
}