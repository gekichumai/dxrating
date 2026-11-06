import type { VersionEnum } from '@gekichumai/dxdata'
import { getSongCatalog, type SongCatalog, type SongCatalogSource } from '@gekichumai/maimai-domain'
import { Data, Effect } from 'effect'
import { McpCatalogSource } from '../application'

/** No published catalog is loaded, so no upstream record can be resolved to a sheet ID */
export class ImportCatalogUnavailable extends Data.TaggedError('ImportCatalogUnavailable')<{
  readonly cause: unknown
}> {}

/**
 * The song catalog server imports resolve upstream records with (design §7.1): the published dxdata catalog the
 * application already keeps in memory (`McpCatalogSource`), under its latest version. Sheet resolution (titles,
 * internal IDs, types, difficulties) does not depend on the version; only internal levels would.
 */
export const importCatalog: Effect.Effect<SongCatalog, ImportCatalogUnavailable, McpCatalogSource> = Effect.gen(
  function* () {
    const source = yield* McpCatalogSource
    const catalog = yield* source.current.pipe(Effect.mapError((cause) => new ImportCatalogUnavailable({ cause })))
    const document = catalog.document as unknown as SongCatalogSource
    const latest = document.versions.at(-1)?.version
    if (!latest) return yield* new ImportCatalogUnavailable({ cause: 'the catalog has no version' })
    return getSongCatalog(document, latest as VersionEnum)
  },
)