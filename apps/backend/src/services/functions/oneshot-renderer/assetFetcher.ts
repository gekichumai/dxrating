import { createAssetLoader } from '@gekichumai/oneshot-renderer'
import { Effect, Data, Either } from 'effect'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { Sentry } from '../../../lib/functions/sentry.js'

export class RendererAssetError extends Data.TaggedError('RendererAssetError')<{
  readonly operation: string
  readonly cause: unknown
}> {
  get message() {
    return this.cause instanceof Error ? this.cause.message : this.operation + ' failed'
  }
}

export const getAssetSourceKey = () =>
  JSON.stringify({
    baseDir: process.env.ASSETS_BASE_DIR,
    cacheDir: process.env.ASSETS_LOCAL_CACHE_DIR || path.join(os.tmpdir(), 'dxrating-assets'),
    remoteUrl: process.env.ASSETS_REMOTE_URL || 'https://shama.dxrating.net',
  })

let source: string | undefined
let loader: ReturnType<typeof createAssetLoader> | undefined
let fallbackImageBuffer: Buffer | undefined

const fallbackImage = Effect.gen(function* () {
  if (fallbackImageBuffer) return fallbackImageBuffer
  const buffer = yield* Effect.tryPromise({
    try: () =>
      sharp({
        create: { width: 1, height: 1, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
      })
        .png()
        .toBuffer(),
    catch: (cause) => new RendererAssetError({ operation: 'create fallback image', cause }),
  })
  fallbackImageBuffer = buffer
  return buffer
})

export const fetchAssetEffect = (relativePath: string) =>
  Effect.suspend(() => {
    const currentSource = getAssetSourceKey()
    if (!loader || source !== currentSource) {
      source = currentSource
      loader = createAssetLoader({
        ...JSON.parse(currentSource),
        onCacheError: (error, path) => Sentry.captureException(error, { extra: { relativePath: path } }),
      })
    }
    const load = loader
    // The shared renderer's asset adapter owns filesystem/HTTP caching and its timeout.
    return Effect.tryPromise({
      try: () => load(relativePath),
      catch: (cause) => new RendererAssetError({ operation: 'load renderer asset', cause }),
    })
  })

export const fetchImageAssetEffect = (relativePath: string) =>
  fetchAssetEffect(relativePath).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          console.warn(`Image asset not found, using gray fallback: ${relativePath}`)
          Sentry.captureException(error.cause, { level: 'warning', extra: { relativePath } })
        })
        return yield* fallbackImage
      }),
    ),
  )

// The shared renderer package accepts Promise loaders at its integration boundary.
export const fetchAsset = (relativePath: string): Promise<Buffer> =>
  Effect.runPromise(Effect.either(Effect.scoped(fetchAssetEffect(relativePath)))).then(
    Either.getOrThrowWith((error) => error),
  )
export const fetchImageAsset = (relativePath: string): Promise<Buffer> =>
  Effect.runPromise(Effect.either(Effect.scoped(fetchImageAssetEffect(relativePath)))).then(
    Either.getOrThrowWith((error) => error),
  )