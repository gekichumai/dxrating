// Replaces snapshot.json with the catalog the dxdata API serves now. Release builds run this so the SSR worker
// renders the catalog of its release; a failed fetch keeps the committed snapshot (and says so) rather than failing
// the release, because clients revalidate against the API anyway.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CATALOG_URL = 'https://miruku.dxrating.net/api/v1/dxdata'
const target = fileURLToPath(new URL('../snapshot.json', import.meta.url))
const strict = process.argv.includes('--strict')

async function fetchCatalog(): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      // A query the edge has not cached: the catalog the origin publishes now, not an edge copy up to hours old
      const response = await fetch(`${CATALOG_URL}?build=${Date.now()}`, {
        headers: { 'X-DXRating-Client': 'dxrating-web-build' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000))
    }
  }
  throw lastError
}

function validate(body: string) {
  const document = JSON.parse(body) as { schemaVersion?: unknown; updatedAt?: unknown; songs?: unknown }
  if (document.schemaVersion !== 1) throw new Error(`unsupported schemaVersion ${String(document.schemaVersion)}`)
  if (typeof document.updatedAt !== 'string') throw new Error('updatedAt is missing')
  if (!Array.isArray(document.songs) || document.songs.length === 0) throw new Error('songs are missing')
  return { updatedAt: document.updatedAt, songs: document.songs.length }
}

try {
  const body = await fetchCatalog()
  const { updatedAt, songs } = validate(body)
  writeFileSync(target, body)
  console.log(`snapshot.json: catalog of ${updatedAt}, ${songs} songs`)
} catch (error) {
  const message = `could not refresh snapshot.json, keeping the committed snapshot: ${String(error)}`
  if (strict) throw new Error(message)
  console.warn(`::warning::${message}`)
}