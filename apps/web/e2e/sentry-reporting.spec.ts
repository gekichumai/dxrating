import { expect, test, type Page } from '@playwright/test'

// With nothing blocked, the lazily loaded SDK still reports errors (including ones thrown before it loaded), the
// pageload transaction with web vitals, and INP interaction spans. Needs a build with a Sentry release:
// `CI=true SENTRY_RELEASE=dxrating@pr-0+0000000 VITE_E2E_BUILD=1 pnpm build`, then E2E_EXPECT_SENTRY=1. The tunnel is stubbed, so nothing
// reaches Sentry.
test.skip(!process.env.E2E_EXPECT_SENTRY, 'Needs a build with a Sentry release (E2E_EXPECT_SENTRY=1)')

type EnvelopeItem = { header: { type?: string }; payload: Record<string, unknown> }

function parseEnvelope(body: string): EnvelopeItem[] {
  const lines = body.split('\n').filter(Boolean)
  const items: EnvelopeItem[] = []
  for (let index = 1; index + 1 < lines.length; index += 2) {
    try {
      items.push({ header: JSON.parse(lines[index]), payload: JSON.parse(lines[index + 1]) })
    } catch {
      // Binary or non-JSON payloads are not asserted on
    }
  }
  return items
}

async function stubTunnel(page: Page) {
  const items: EnvelopeItem[] = []
  await page.route('**/monitoring/tunnel**', async (route) => {
    items.push(...parseEnvelope(route.request().postData() ?? ''))
    await route.fulfill({ status: 200, body: '' })
  })
  return items
}

test('reports errors, the pageload with web vitals, and INP spans', async ({ page }) => {
  // Sample the trace (tracesSampleRate is 0.2) so the test is deterministic
  await page.addInitScript(() => {
    Math.random = () => 0.01
  })
  const items = await stubTunnel(page)

  // Thrown after the app's entry has run but before the SDK has loaded, i.e. during hydration: the early-error buffer
  // must keep it and the SDK must report it once loaded. The entry is an async module script, so the probe fires when
  // the buffer installs its window listener.
  await page.addInitScript(() => {
    const probeWindow = window as { __SENTRY__?: unknown; e2eEarlyProbeBeforeSdk?: boolean }
    const addEventListener = EventTarget.prototype.addEventListener
    let fired = false
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      ...args: Parameters<typeof addEventListener>
    ) {
      addEventListener.apply(this, args)
      if (fired || this !== window || args[0] !== 'unhandledrejection' || probeWindow.__SENTRY__) return
      fired = true
      setTimeout(() => {
        probeWindow.e2eEarlyProbeBeforeSdk = !probeWindow.__SENTRY__
        throw new Error('e2e-early-probe')
      })
    }
  })
  await page.goto('/')

  // A slow interaction, so INP has something to report (the observer ignores interactions under 40 ms)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 })
  const versionButton = page.locator('button.version-switcher')
  await versionButton.click()
  await expect(versionButton).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  // Wait for the SDK to load, then throw after it has
  await expect
    .poll(() => page.evaluate(() => Boolean((window as { __SENTRY__?: unknown }).__SENTRY__)), { timeout: 15_000 })
    .toBe(true)
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('e2e-late-probe')
    }),
  )

  // Hiding the page flushes the pageload transaction and the INP span
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
  })

  const errorMessages = () =>
    items
      .filter((item) => item.header.type === 'event')
      .map((item) => JSON.stringify((item.payload.exception as { values?: unknown[] } | undefined)?.values ?? ''))
      .join('\n')
  await expect.poll(errorMessages, { timeout: 20_000 }).toContain('e2e-early-probe')
  expect(await page.evaluate(() => (window as { e2eEarlyProbeBeforeSdk?: boolean }).e2eEarlyProbeBeforeSdk)).toBe(true)
  await expect.poll(errorMessages, { timeout: 20_000 }).toContain('e2e-late-probe')

  const pageload = () =>
    items.find(
      (item) =>
        item.header.type === 'transaction' &&
        (item.payload.contexts as { trace?: { op?: string } } | undefined)?.trace?.op === 'pageload',
    )
  await expect.poll(() => Boolean(pageload()), { timeout: 20_000 }).toBe(true)
  const measurements = Object.keys((pageload()?.payload.measurements as Record<string, unknown>) ?? {})
  expect(measurements).toEqual(expect.arrayContaining(['fcp', 'ttfb']))

  const interactionOps = () =>
    items
      .filter((item) => item.header.type === 'span')
      .map((item) =>
        String(item.payload.op ?? (item.payload.data as Record<string, unknown> | undefined)?.['sentry.op']),
      )
  await expect.poll(interactionOps, { timeout: 20_000 }).toContainEqual(expect.stringMatching(/^ui\.interaction/))
})
test('names the pageload after the document when the visitor navigates before the SDK loads', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.01
  })
  const items = await stubTunnel(page)

  // Hold the SDK until the visitor has navigated in the app
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/assets/error-reporting-*.js', async (route) => {
    await released
    await route.continue()
  })

  await page.goto('/')
  await page.locator('a[href="/charts/recent"]').first().click()
  await expect(page).toHaveURL(/\/charts\/recent/)
  release()

  await expect
    .poll(() => page.evaluate(() => Boolean((window as { __SENTRY__?: unknown }).__SENTRY__)), { timeout: 15_000 })
    .toBe(true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  const pageload = () =>
    items.find(
      (item) =>
        item.header.type === 'transaction' &&
        (item.payload.contexts as { trace?: { op?: string } } | undefined)?.trace?.op === 'pageload',
    )
  await expect.poll(() => Boolean(pageload()), { timeout: 20_000 }).toBe(true)
  const documentUrl = new URL('/', page.url()).href
  const payload = pageload()?.payload
  expect(payload?.transaction).toBe('/')
  expect((payload?.request as { url?: string } | undefined)?.url).toBe(documentUrl)
  const traceData = (payload?.contexts as { trace?: { data?: Record<string, unknown> } } | undefined)?.trace?.data
  expect(traceData?.['url.full']).toBe(documentUrl)
})