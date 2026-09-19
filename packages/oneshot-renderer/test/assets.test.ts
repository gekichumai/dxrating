import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssetLoader } from '../src/assets.js'

const directories: string[] = []
const directory = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'oneshot-assets-'))
  directories.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('asset loader', () => {
  it('limits concurrent downloads without dropping queued assets', async () => {
    let active = 0
    let maximum = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return new Response('asset')
    })
    const load = createAssetLoader({
      cacheDir: await directory(),
      remoteUrl: 'https://example.invalid',
      maxConcurrent: 2,
      fetch,
    })
    const results = await Promise.all(Array.from({ length: 7 }, (_, i) => load(`${i}.png`)))
    expect(results).toHaveLength(7)
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(maximum).toBe(2)
  })

  it('uses ASSETS_BASE_DIR bytes ahead of the writable cache and does not fetch', async () => {
    const baseDir = await directory()
    const cacheDir = await directory()
    await writeFile(path.join(baseDir, 'font.otf'), 'source')
    await writeFile(path.join(cacheDir, 'font.otf'), 'stale')
    const fetch = vi.fn<typeof globalThis.fetch>()
    const load = createAssetLoader({ baseDir, cacheDir, remoteUrl: 'https://example.invalid', fetch })
    expect((await load('/font.otf')).toString()).toBe('source')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent remote requests and persists exact bytes', async () => {
    const cacheDir = await directory()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new Uint8Array([3, 4, 5])))
    const load = createAssetLoader({ cacheDir, remoteUrl: 'https://example.invalid/', fetch })
    const [a, b] = await Promise.all([load('/images/cover.jpg'), load('images/cover.jpg')])
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://example.invalid/images/cover.jpg')
    expect(await readFile(path.join(cacheDir, 'images/cover.jpg'))).toEqual(a)
  })

  it('does not cache failed downloads and attaches a timeout signal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok'))
    const load = createAssetLoader({ cacheDir: await directory(), remoteUrl: 'https://example.invalid', fetch })
    await expect(load('a.png')).rejects.toThrow('503')
    expect((await load('a.png')).toString()).toBe('ok')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('bounds in-memory bytes and isolates asset roots', async () => {
    const cacheDir = await directory()
    await writeFile(path.join(cacheDir, 'a'), 'aa')
    await writeFile(path.join(cacheDir, 'b'), 'bb')
    const load = createAssetLoader({ cacheDir, maxBytes: 2, remoteUrl: 'https://example.invalid' })
    await load('a')
    await load('b')
    await writeFile(path.join(cacheDir, 'a'), 'cc')
    expect((await load('a')).toString()).toBe('cc')
    const other = await directory()
    await writeFile(path.join(other, 'a'), 'dd')
    expect((await createAssetLoader({ cacheDir: other, remoteUrl: 'https://example.invalid' })('a')).toString()).toBe(
      'dd',
    )
  })

  it('rejects traversal before disk or network access', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const load = createAssetLoader({ cacheDir: await directory(), remoteUrl: 'https://example.invalid', fetch })
    for (const invalid of ['../secret', '/images/../../secret', 'images\\secret', 'x?y']) {
      await expect(load(invalid)).rejects.toThrow('Invalid asset path')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('still returns a successful download if the cache cannot be written', async () => {
    const cacheDir = await directory()
    const onCacheError = vi.fn()
    const load = createAssetLoader({
      cacheDir: path.join(cacheDir, 'missing'),
      remoteUrl: 'https://example.invalid',
      fetch: vi.fn(async () => {
        await writeFile(path.join(cacheDir, 'missing'), 'file')
        return new Response('downloaded')
      }),
      onCacheError,
    })
    expect((await load('image.png')).toString()).toBe('downloaded')
    expect(onCacheError).toHaveBeenCalledTimes(1)
  })
})