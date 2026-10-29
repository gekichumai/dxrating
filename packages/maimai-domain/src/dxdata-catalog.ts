import { dxdata, type VersionEnum } from '@gekichumai/dxdata'
import { buildSongCatalog, createSongCatalog, type SongCatalog } from './song-catalog.ts'

const cache = new Map<VersionEnum, SongCatalog>()

export function getDxdataSongCatalog(version: VersionEnum): SongCatalog {
  const cached = cache.get(version)
  if (cached) return cached

  const catalog = freezeSongCatalog(buildSongCatalog(dxdata, version))
  cache.set(version, catalog)
  return catalog
}

function freezeSongCatalog(catalog: SongCatalog): SongCatalog {
  // Projected sheets share nested values with their song (each sheet spreads the song, including its full `sheets`
  // array), so reuse one frozen clone per source object instead of re-cloning the same data for every sheet.
  // The projected sheet objects themselves are fresh and private to this call, so they are frozen in place.
  const clones = new WeakMap<object, unknown>()
  const sheets = Object.freeze(catalog.sheets.map((sheet) => freezeOwnedObject(sheet, clones)))
  const frozenCatalog = createSongCatalog(catalog.version, sheets)
  return Object.freeze({
    ...frozenCatalog,
    sheets,
  }) as SongCatalog
}

function freezeOwnedObject<T extends object>(value: T, clones: WeakMap<object, unknown>): T {
  const target = value as Record<PropertyKey, unknown>
  for (const key of Reflect.ownKeys(target)) {
    target[key] = cloneAndDeepFreeze(target[key], clones)
  }
  return Object.freeze(value)
}

function cloneAndDeepFreeze<T>(value: T, clones: WeakMap<object, unknown>): T {
  if (!isObject(value)) return value

  const cached = clones.get(value)
  if (cached) return cached as T

  let frozen: T
  if (Array.isArray(value)) {
    frozen = Object.freeze(value.map((item) => cloneAndDeepFreeze(item, clones))) as T
  } else {
    const source = value as Record<PropertyKey, unknown>
    const clone: Record<PropertyKey, unknown> = {}
    for (const key of Reflect.ownKeys(source)) {
      clone[key] = cloneAndDeepFreeze(source[key], clones)
    }
    frozen = Object.freeze(clone) as T
  }
  clones.set(value, frozen)
  return frozen
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}