import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHydrated } from './hydration'

// Ad-block lists such as EasyPrivacy block every URL containing "sentry". The page must hydrate without the SDK.

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