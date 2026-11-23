import { expect, type Page } from '@playwright/test'

/** React's hydration errors (minified #418-#425 and their development messages) and any uncaught error */
export function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/Minified React error #(418|419|420|421|422|423|424|425)|hydrat/i.test(text)) errors.push(`console: ${text}`)
  })
  return errors
}

export async function waitForHydration(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(document.querySelector('main') ?? document.body).some((key) => key.startsWith('__reactFiber$')),
      ),
    )
    .toBe(true)
  await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve, { timeout: 2_000 })))
}

export async function expectHydrated(page: Page) {
  // The version picker opens only once React has attached its handlers (its label is localized)
  const versionButton = page.locator('button.version-switcher')
  await expect(versionButton).toHaveAttribute('aria-expanded', 'false')
  await versionButton.click()
  await expect(versionButton).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
}