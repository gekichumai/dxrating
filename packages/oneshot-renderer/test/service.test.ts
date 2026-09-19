import { VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it, vi } from 'vitest'
import { createRenderService, RenderQueueFullError } from '../src/service.js'
import type { RenderInput, RenderResult } from '../src/types.js'

const input: RenderInput = { data: { b15: [], b35: [] }, version: VersionEnum.PRiSMPLUS }
const result: RenderResult = { body: new Uint8Array([1, 2, 3]), contentType: 'image/png', timings: {} }
const deferred = () => {
  let resolve!: (result: RenderResult) => void
  const promise = new Promise<RenderResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('render service', () => {
  it('coalesces equal requests, including normalized widths, then returns a cache hit', async () => {
    const task = deferred()
    const render = vi.fn(() => task.promise)
    const service = createRenderService(render)
    const first = service(input, { format: 'png' })
    const second = service(input, { format: 'png', width: NaN })
    expect(render).toHaveBeenCalledTimes(1)
    task.resolve(result)
    expect((await first).cache).toBe('MISS')
    expect((await second).cache).toBe('COALESCED')
    expect((await service(input, { format: 'png', width: 1500 })).cache).toBe('HIT')
  })

  it('limits active renders and queued work while allowing coalesced callers', async () => {
    const firstTask = deferred()
    const render = vi.fn().mockReturnValueOnce(firstTask.promise).mockResolvedValue(result)
    const service = createRenderService(render, { maxConcurrent: 1, maxQueued: 1 })
    const first = service(input, { format: 'png', width: 1000 })
    const second = service(input, { format: 'png', width: 2000 })
    const duplicate = service(input, { format: 'png', width: 2000 })
    await expect(service(input, { format: 'png', width: 3000 })).rejects.toBeInstanceOf(RenderQueueFullError)
    expect(render).toHaveBeenCalledTimes(1)
    firstTask.resolve(result)
    await Promise.all([first, second, duplicate])
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('releases failed work and does not cache rejections', async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error('font missing')).mockResolvedValue(result)
    const service = createRenderService(render)
    const failed = service(input)
    const queued = service({ ...input, region: 'intl' })
    await expect(failed).rejects.toThrow('font missing')
    await queued
    await expect(service(input)).resolves.toMatchObject({ cache: 'MISS' })
    expect(render).toHaveBeenCalledTimes(3)
  })

  it('evicts by bytes and expiry, never retaining an oversized image', async () => {
    let now = 0
    const render = vi.fn().mockResolvedValue(result)
    const service = createRenderService(render, { cacheMaxBytes: 3, cacheTtlMs: 100, now: () => now })
    await service(input)
    await service({ ...input, region: 'intl' })
    expect((await service(input)).cache).toBe('MISS')
    now = 101
    expect((await service(input)).cache).toBe('MISS')
    const uncached = createRenderService(render, { cacheMaxBytes: 2 })
    await uncached(input)
    expect((await uncached(input)).cache).toBe('MISS')
  })

  it('keeps different widths, formats and player data separate', async () => {
    const render = vi.fn().mockResolvedValue(result)
    const service = createRenderService(render)
    await service(input, { format: 'png', width: 750 })
    await service(input, { format: 'png', width: 1500 })
    await service(input, { format: 'jpeg', width: 1500 })
    await service({ ...input, playerCollection: { name: 'Alice', icon: 1 } }, { format: 'png', width: 1500 })
    expect(render).toHaveBeenCalledTimes(4)
  })
})