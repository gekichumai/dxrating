import { expect, test, type Page } from '@playwright/test'

// Ad-block lists such as EasyPrivacy block every URL containing "sentry". The page must hydrate without the SDK.

/** React's hydration errors (#418, #423, #425 and their development messages) and any uncaught error */
function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/Minified React error #(418|419|421|422|423|425)|hydrat/i.test(text)) errors.push(`console: ${text}`)
  })
  return errors
}

async function expectHydrated(page: Page) {
  // The version picker opens only once React has attached its handlers (its label is localized)
  const versionButton = page.locator('button.version-switcher')
  await expect(versionButton).toHaveAttribute('aria-expanded', 'false')
  await versionButton.click()
  await expect(versionButton).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
}

for (const locale of ['en', 'ja']) {
  test(`hydrates with every *sentry* URL blocked (${locale})`, async ({ page }) => {
    const blocked: string[] = []
    await page.route(/sentry/i, (route) => {
      blocked.push(route.request().url())
      return route.abort('blockedbyclient')
    })
    // Nothing may reach the real tunnel from a test
    await page.route('**/monitoring/tunnel**', (route) => route.fulfill({ status: 200, body: '' }))
    const errors = collectPageErrors(page)

    await page.goto(locale === 'en' ? '/' : `/?locale=${locale}`)
    await expectHydrated(page)

    // The search field works too
    const search = page.locator('main input[type="text"]').first()
    await search.fill('Oshama')
    await expect(page.getByText(/OSHAMA SCRAMBLE/i).first()).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
    // No first-party script is named after the SDK, so the block finds nothing to block on our origin
    const origin = new URL(page.url()).origin
    expect(blocked.filter((url) => url.startsWith(origin))).toEqual([])
  })
}