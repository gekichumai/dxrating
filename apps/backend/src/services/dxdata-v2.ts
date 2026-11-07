import { createHash } from 'node:crypto'
import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { toV2Catalog } from '@gekichumai/dxdata/v2'
import { Effect } from 'effect'
import { DxdataDecodeError, type PublishedDxdataMetadata } from './dxdata'

/** The v2 catalog (gekichumai/meta#43): the published catalog without its community data and repeated defaults */
export const DXDATA_V2_PATH = '/api/v2/dxdata'
export const DXDATA_V2_CACHE_TAG = 'dxdata-v2'

interface DxdataStore<E, R> {
  getPublishedMetadata: () => Effect.Effect<PublishedDxdataMetadata | undefined, E, R>
  getSnapshotBody: (catalogRunId: string, bodySha256: string) => Effect.Effect<string | undefined, E, R>
}

/**
 * The published catalog as v2, derived on the backend from the v1 snapshot the producer stores: no producer or schema
 * change. It is built once per published body and kept, so a request costs the same metadata query as v1. The v2
 * metadata describes the v2 body: its sha256 is the ETag, its length the `Content-Length`. Plug it into
 * `createDxdataEffect` to serve it with the v1 endpoint's validators, Brotli body and cache headers.
 */
export const createDxdataV2Store = <E, R>(v1: DxdataStore<E, R>) => {
  let built: { v1Sha256: string; metadata: PublishedDxdataMetadata; body: string } | undefined

  const build = (v1Metadata: PublishedDxdataMetadata) =>
    Effect.gen(function* () {
      if (built?.v1Sha256 === v1Metadata.bodySha256) return built
      const v1Body = yield* v1.getSnapshotBody(v1Metadata.catalogRunId, v1Metadata.bodySha256)
      if (v1Body === undefined) return undefined
      const body = yield* Effect.try({
        try: () => JSON.stringify(toV2Catalog(JSON.parse(v1Body) as SongCatalogDocument)),
        catch: (cause) => new DxdataDecodeError({ operation: 'build the v2 catalog', cause }),
      })
      const entry = {
        v1Sha256: v1Metadata.bodySha256,
        body,
        metadata: {
          catalogRunId: v1Metadata.catalogRunId,
          bodySha256: createHash('sha256').update(body).digest('hex'),
          byteLength: Buffer.byteLength(body).toString(),
          contentType: 'application/json; charset=utf-8',
        },
      }
      built = entry
      return entry
    })

  return {
    getPublishedMetadata: () =>
      Effect.gen(function* () {
        const v1Metadata = yield* v1.getPublishedMetadata()
        if (!v1Metadata) return undefined
        return (yield* build(v1Metadata))?.metadata
      }),
    getSnapshotBody: (_catalogRunId: string, bodySha256: string) =>
      Effect.sync(() => (built?.metadata.bodySha256 === bodySha256 ? built.body : undefined)),
  }
}