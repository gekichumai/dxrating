import { dxdata, type VersionEnum } from '@gekichumai/dxdata'
import { buildSongCatalog, createSongCatalog, type SongCatalog } from './song-catalog.ts'
import type { VersionedSheet } from './types.js'

const cache = new Map<VersionEnum, SongCatalog>()

export function getDxdataSongCatalog(version: VersionEnum): SongCatalog {
  const cached = cache.get(version)
  if (cached) return cached

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
  }) as SongCatalog
}

function freezeVersionedSheet(sheet: VersionedSheet): VersionedSheet {
  return cloneAndDeepFreeze(sheet)
}

function cloneAndDeepFreeze<T>(value: T): T {
  if (!isObject(value)) return value

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndDeepFreeze(item))) as T
  }

  const source = value as Record<PropertyKey, unknown>
  const clone: Record<PropertyKey, unknown> = {}
  for (const key of Reflect.ownKeys(source)) {
    clone[key] = cloneAndDeepFreeze(source[key])
  }
  return Object.freeze(clone) as T
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}