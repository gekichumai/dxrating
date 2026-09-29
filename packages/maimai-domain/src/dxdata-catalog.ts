import { dxdata, type VersionEnum } from '@gekichumai/dxdata'
import { buildSongCatalog, createSongCatalog, type SongCatalog } from './song-catalog.ts'
import type { VersionedSheet } from './types'

const cache = new Map<VersionEnum, SongCatalog>()

export function getDxdataSongCatalog(version: VersionEnum): SongCatalog {
  const cached = cache.get(version)
  if (cached !== undefined) return cached

  const catalog = freezeSongCatalog(buildSongCatalog(dxdata, version))
  cache.set(version, catalog)
  return catalog
}

function freezeSongCatalog(catalog: SongCatalog): SongCatalog {
  const sheets = Object.freeze(catalog.sheets.map(freezeVersionedSheet))
  const frozenCatalog = createSongCatalog(catalog.version, sheets)
  return Object.freeze({
    ...frozenCatalog,
    sheets,
  })
}

function freezeVersionedSheet(sheet: VersionedSheet): VersionedSheet {
  return cloneAndDeepFreeze(sheet)
}

function cloneAndDeepFreeze<T>(value: T): T {
  if (!isObject(value)) return value

  if (Array.isArray(value)) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Recursively cloning an array preserves the generic input shape.
    return Object.freeze(value.map((item) => cloneAndDeepFreeze(item))) as T
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- isObject above narrows the input before enumerating its own keys.
  const source = value as Record<PropertyKey, unknown>
  const clone: Record<PropertyKey, unknown> = {}
  for (const key of Reflect.ownKeys(source)) {
    clone[key] = cloneAndDeepFreeze(source[key])
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Every own key is copied recursively without changing its type.
  return Object.freeze(clone) as T
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}