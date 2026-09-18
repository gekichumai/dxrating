import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ByteCache } from './cache.js'
import type { LoadAsset } from './types.js'

/** An instance belongs to one immutable source configuration; never share it between asset roots. */
export function createAssetLoader({
  baseDir,
  cacheDir,
  remoteUrl,
  maxBytes = 64 * 1024 * 1024,
  timeoutMs = 10_000,
  maxConcurrent = 6,
  fetch: fetchAsset = globalThis.fetch,
  onCacheError,
}: {
  baseDir?: string
  cacheDir: string
  remoteUrl: string
  maxBytes?: number
  timeoutMs?: number
  maxConcurrent?: number
  fetch?: typeof globalThis.fetch
  onCacheError?: (error: unknown, relativePath: string) => void
}): LoadAsset {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('Invalid asset concurrency limit')
  const cache = new ByteCache<Buffer>(maxBytes)
  const pending = new Map<string, Promise<Buffer>>()
  const queue: (() => void)[] = []
  let active = 0

  const load = async (relativePath: string) => {
    for (const directory of new Set([baseDir, cacheDir])) {
      if (!directory) continue
      try {
        return await readFile(path.join(directory, relativePath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const url = `${remoteUrl.replace(/\/$/, '')}/${relativePath}`
    const response = await fetchAsset(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) throw new Error(`Failed to fetch asset from ${url}: ${response.status} ${response.statusText}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    const destination = path.join(cacheDir, relativePath)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(temporary, buffer)
      await rename(temporary, destination)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      onCacheError?.(error, relativePath)
    }
    return buffer
  }

  return async (requestedPath) => {
    const relativePath = requestedPath.replace(/^\/+/, '')
    if (
      !relativePath ||
      relativePath.split('/').includes('..') ||
      relativePath.includes('\0') ||
      /[\\?#]/.test(relativePath)
    ) {
      throw new Error(`Invalid asset path: ${requestedPath}`)
    }
    const cached = cache.get(relativePath)
    if (cached) return cached
    const existing = pending.get(relativePath)
    if (existing) return existing
    const promise = (async () => {
      if (active >= maxConcurrent) await new Promise<void>((resolve) => queue.push(resolve))
      else active++
      try {
        const buffer = await load(relativePath)
        cache.set(relativePath, buffer, buffer.byteLength)
        return buffer
      } finally {
        const next = queue.shift()
        if (next) next()
        else active--
      }
    })()
    pending.set(relativePath, promise)
    try {
      return await promise
    } finally {
      pending.delete(relativePath)
    }
  }
}