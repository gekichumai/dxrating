import { useSyncExternalStore } from 'react'
import type { z } from 'zod'

// The browser refuses storage with blocked site data and in some private windows, a write can exceed the quota, and a
// stored value can be corrupt or from an older build: nothing here throws, and every value is checked against its schema.

export type StorageArea = 'local' | 'session'

/**
 * The browser's storage, or `null` on the server and where the browser refuses it. For a module that keeps its own
 * stored format and takes the storage as a parameter; a value is stored with {@link persisted}.
 */
export function browserStorage(area: StorageArea): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export interface Persisted<T, F> {
  /** The stored value, or the fallback when there is none, storage is unavailable or the value fails the schema */
  get(): T | F
  /** Stores the value; returns whether storage took it. A value it refuses wins until what storage holds changes */
  set(value: T): boolean
  remove(): void
  /** Calls back when this page or another tab changes the value */
  subscribe(onChange: () => void): () => void
  readonly fallback: F
}

interface Format<T> {
  encode(value: T): string
  decode(raw: string): unknown
}

const JSON_FORMAT: Format<unknown> = { encode: (value) => JSON.stringify(value), decode: (raw) => JSON.parse(raw) }
const TEXT_FORMAT: Format<string> = { encode: (value) => value, decode: (raw) => raw }

const CHANGED_EVENT = 'dxrating:persisted-changed'

/**
 * A value kept in the browser's storage under `key`, as JSON by default or as the bare string with `format: 'text'`.
 * Create it once at module level when a component subscribes to it: `get` returns the same object until the stored
 * value changes.
 */
export function persisted<T, F>(
  key: string,
  schema: z.ZodType<T>,
  fallback: F,
  options?: { area?: StorageArea; format?: 'json' },
): Persisted<T, F>
export function persisted<T extends string, F>(
  key: string,
  schema: z.ZodType<T>,
  fallback: F,
  options: { area?: StorageArea; format: 'text' },
): Persisted<T, F>
export function persisted<T, F>(
  key: string,
  schema: z.ZodType<T>,
  fallback: F,
  { area = 'local', format = 'json' }: { area?: StorageArea; format?: 'json' | 'text' } = {},
): Persisted<T, F> {
  const id = `${area}:${key}`
  const codec = (format === 'text' ? TEXT_FORMAT : JSON_FORMAT) as Format<T>
  let last: { raw: string | null; value: T | F } | null = null
  // A write storage refused (`raw: null` for a removal), over the value storage held then. It wins until storage holds
  // something else: a write that succeeds, or another tab's
  let unsaved: { raw: string | null; over: string | null } | null = null

  const readStored = (): string | null => {
    try {
      return browserStorage(area)?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  const decode = (raw: string | null): T | F => {
    if (raw === null) return fallback
    try {
      const parsed = schema.safeParse(codec.decode(raw))
      return parsed.success ? parsed.data : fallback
    } catch {
      return fallback
    }
  }

  const store = (raw: string | null): boolean => {
    const storage = browserStorage(area)
    if (!storage) return false
    try {
      if (raw === null) storage.removeItem(key)
      else storage.setItem(key, raw)
      return true
    } catch {
      return false
    }
  }

  const write = (raw: string | null): boolean => {
    if (typeof window === 'undefined') return false
    const over = readStored()
    const saved = store(raw)
    unsaved = saved ? null : { raw, over }
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: id }))
    return saved
  }

  return {
    fallback,
    get() {
      const stored = readStored()
      if (unsaved && unsaved.over !== stored) unsaved = null
      const raw = unsaved ? unsaved.raw : stored
      if (last?.raw !== raw) last = { raw, value: decode(raw) }
      return last.value
    },
    set: (value) => write(codec.encode(value)),
    remove() {
      write(null)
    },
    subscribe(onChange) {
      const onChanged = (event: Event) => {
        if ((event as CustomEvent<string>).detail === id) onChange()
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) onChange()
      }
      window.addEventListener(CHANGED_EVENT, onChanged)
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener(CHANGED_EVENT, onChanged)
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}

/** The value and its setter. The server render and hydration see the fallback, so they match */
export function usePersisted<T, F>(value: Persisted<T, F>): [T | F, (next: T) => boolean] {
  const current = useSyncExternalStore(value.subscribe, value.get, () => value.fallback)
  return [current, value.set]
}