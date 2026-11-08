import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chunkError = (file: string) =>
  new TypeError(`Failed to fetch dynamically imported module: https://dxrating.net/assets/${file}`)

let reload: ReturnType<typeof vi.fn>

async function load() {
  vi.resetModules()
  return import('../stale-build')
}

beforeEach(() => {
  sessionStorage.clear()
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isStaleChunkError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://dxrating.net/assets/a-1.js',
    'error loading dynamically imported module: https://dxrating.net/assets/a-1.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/a-1.css',
    "'text/html' is not a valid JavaScript MIME type.",
  ])('recognises %j', async (message) => {
    const { isStaleChunkError } = await load()
    expect(isStaleChunkError(new TypeError(message))).toBe(true)
  })

  it.each([new Error('Network request failed'), new SyntaxError('Invalid or unexpected token'), 'text', null])(
    'ignores %j',
    async (error) => {
      const { isStaleChunkError } = await load()
      expect(isStaleChunkError(error)).toBe(false)
    },
  )
})

describe('reloadForNewBuild', () => {
  it('reloads once per failed file, and not again after the reload', async () => {
    let module = await load()
    expect(module.reloadForNewBuild(chunkError('a-1.js'))).toBe(true)
    expect(module.isReloadingForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()

    // The reloaded page: the same file failing again is missing from the current build
    module = await load()
    expect(module.reloadForNewBuild(chunkError('a-1.js'))).toBe(false)
    expect(module.isReloadingForNewBuild()).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('stops after three reloads in a session', async () => {
    for (const file of ['a.js', 'b.js', 'c.js']) expect((await load()).reloadForNewBuild(chunkError(file))).toBe(true)
    expect((await load()).reloadForNewBuild(chunkError('d.js'))).toBe(false)
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('does not reload without sessionStorage, which guards against a loop', async () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.stubGlobal('sessionStorage', { getItem: denied, setItem: denied })
    expect((await load()).reloadForNewBuild(chunkError('a.js'))).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('installStaleBuildRecovery', () => {
  it('reloads for a failed Vite preload and an unhandled import() rejection, and only for chunk errors', async () => {
    const { installStaleBuildRecovery } = await load()
    installStaleBuildRecovery()

    const preload = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: chunkError('a.js') })
    window.dispatchEvent(preload)
    expect(reload).toHaveBeenCalledOnce()
    // Not cancelled: the importer still sees the error
    expect(preload.defaultPrevented).toBe(false)

    const other = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent
    Object.defineProperty(other, 'reason', { value: new Error('boom') })
    window.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)

    const rejection = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', { value: chunkError('b.js') })
    window.dispatchEvent(rejection)
    // Already reloading: the rejection is expected, so it is not reported as unhandled
    expect(rejection.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })
})