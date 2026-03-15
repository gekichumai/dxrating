import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Sentry } from '../../../lib/functions/sentry.js'
import { ASSETS_LOCAL_CACHE_DIR, ASSETS_REMOTE_URL } from './index.js'

const cacheDir = ASSETS_LOCAL_CACHE_DIR || path.join(os.tmpdir(), 'dxrating-assets')

/**
 * Fetches an asset by relative path, trying local disk cache first.
 * If not found locally, fetches from the remote asset server and caches to disk.
 */
export async function fetchAsset(relativePath: string): Promise<Buffer> {
  const localPath = path.join(cacheDir, relativePath)

  // Try local disk first
  try {
    return await fs.readFile(localPath)
  } catch {
    // Not cached locally, fetch from remote
  }

  const url = `${ASSETS_REMOTE_URL}/${relativePath.replace(/^\//, '')}`
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
