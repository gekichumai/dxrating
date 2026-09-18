import { VersionEnum } from '@gekichumai/dxdata'
import { RenderQueueFullError } from '@gekichumai/oneshot-renderer'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handler } from '../services/functions/oneshot-renderer/index.js'

const { render } = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock('@gekichumai/oneshot-renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gekichumai/oneshot-renderer')>()),
  createOneshotRenderer: () => render,
}))

const app = new Hono().post('/functions/render-oneshot/v0', handler)
let sequence = 0
const body = () => ({
  entries: [],
  version: VersionEnum.PRiSMPLUS,
  region: 'jp',
  playerCollection: { name: `Fixture ${sequence++}`, icon: 1 },
})
const request = (query: string, payload = body()) =>
  app.request(`/functions/render-oneshot/v0${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
const image = {
  body: new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4),
  contentType: 'image/png',
  timings: { satori: 1.5 },
}
beforeEach(() => {
  render.mockReset().mockResolvedValue(image)
})

describe('oneshot HTTP adapter', () => {
  it.each([
    ['', 'svg', undefined],
    ['?format=png&width=750', 'svg', undefined],
    ['?pixelated=1', 'jpeg', 1500],
    ['?pixelated=1&format=png&width=750', 'png', 750],
    ['?pixelated=1&format=other&width=3001', 'jpeg', 1500],
    ['?pixelated=1&format=png&width=bad', 'png', 1500],
    ['?pixelated=1&format=png&width=750.5', 'png', 750],
  ])('preserves output selection for %s', async (query, format, width) => {
    const response = await request(query)
    expect(response.status).toBe(200)
    expect(render.mock.calls[0][1]).toEqual({ format, width })
    expect(response.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
    expect(response.headers.get('server-timing')).toContain('satori;dur=1.5')
  })

  it('coalesces concurrent requests and serves exact cached response bytes', async () => {
    let resolve!: (value: typeof image) => void
    render.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const payload = body()
    const a = request('?pixelated=1&format=png', payload)
    const b = request('?pixelated=1&format=png', payload)
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))
    resolve(image)
    const responses = await Promise.all([a, b])
    expect(responses.map((res) => res.headers.get('x-cache'))).toEqual(['MISS', 'COALESCED'])
    const cached = await request('?pixelated=1&format=png&width=1500', payload)
    expect(cached.headers.get('x-cache')).toBe('HIT')
    expect([...new Uint8Array(await cached.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('reports queue saturation as retryable HTTP 503', async () => {
    render.mockRejectedValueOnce(new RenderQueueFullError())
    const response = await request('?pixelated=1')
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')
  })
})