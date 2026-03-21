import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { Sentry } from '../../../lib/functions/sentry.js'

const getCacheDir = () => process.env.ASSETS_LOCAL_CACHE_DIR || path.join(os.tmpdir(), 'dxrating-assets')
const getRemoteUrl = () => process.env.ASSETS_REMOTE_URL || 'https://shama.dxrating.net'

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

/**
 * Fetches an asset by relative path, trying local disk cache first.
 * If not found locally, fetches from the remote asset server and caches to disk.
 */
export async function fetchAsset(relativePath: string): Promise<Buffer> {
  const localPath = path.join(getCacheDir(), relativePath)

  // Try local disk first
  try {
    return await fs.readFile(localPath)
  } catch {
    // Not cached locally, fetch from remote
  }

  const url = `${getRemoteUrl()}/${relativePath.replace(/^\//, '')}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch asset from ${url}: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  // Cache to disk (best-effort, don't block on errors)
  try {
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, buffer)
  } catch (error) {
    console.error(`Failed to cache asset to ${localPath}:`, error)
    Sentry.captureException(error, { extra: { localPath, relativePath } })
  }

  return buffer
}