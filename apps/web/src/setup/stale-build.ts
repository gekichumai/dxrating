/**
 * Recovers a page that outlived its build. A deploy replaces the hashed files under /assets, so a tab opened before it
 * fails to load any chunk it has not fetched yet ("Failed to fetch dynamically imported module …"). Reloading picks up
 * the new build's HTML and its chunks.
 *
 * Each failed file reloads the page at most once per tab session (sessionStorage), and a session reloads at most
 * MAX_RELOADS times in all: after a reload the new build no longer asks for the old file, so a file that fails again
 * is missing from the current build too, and reloading would loop. Without sessionStorage there is no guard, so no
 * reload either. TanStack Router's lazy route components have their own one-time reload for the same errors.
 */

const STORAGE_KEY = 'dxrating.staleBuildReloads'
const MAX_RELOADS = 3

// Chrome, Firefox, Safari; Vite's CSS preload; Safari for a module answered with the HTML 404 page
const STALE_CHUNK_MESSAGES = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /is not a valid JavaScript MIME type/i,
]

let reloading = false

/** Whether a reload for a new build is under way: errors from the page being thrown away are not worth reporting */
export const isReloadingForNewBuild = () => reloading

export function isStaleChunkError(error: unknown): error is Error {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && STALE_CHUNK_MESSAGES.some((pattern) => pattern.test(message))
}

/** Reloads the page for a chunk that failed to load, unless the guard says it already did; returns whether it does */
export function reloadForNewBuild(error: Error): boolean {
  if (reloading) return true
  let reloaded: string[]
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    reloaded = Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return false
  }
  // The message names the file that failed
  if (reloaded.includes(error.message) || reloaded.length >= MAX_RELOADS) return false
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...reloaded, error.message]))
  } catch {
    return false
  }
  reloading = true
  window.location.reload()
  return true
}

let installed = false

/** Called from the client entry (src/client.tsx); does nothing on the server */
export function installStaleBuildRecovery() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // Vite's preload helper, around every dynamic import that has dependencies to preload. The error still reaches the
  // importer (the event is not cancelled), which keeps its own error handling; reporting drops it while reloading.
  window.addEventListener('vite:preloadError', (event) => {
    const error = (event as Event & { payload?: unknown }).payload
    if (isStaleChunkError(error)) reloadForNewBuild(error)
  })

  // Plain import() calls with nothing to preload, such as the legacy song ID map
  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleChunkError(event.reason) && reloadForNewBuild(event.reason)) event.preventDefault()
  })
}