import { expect, test, type Page } from '@playwright/test'

// The narrowest phone we support and each breakpoint boundary
const WIDTHS = [320, 360, 375, 768, 1024]
const LOCALES = ['en', 'ja'] as const
const SONG = '/songs/dsng_mrw93jj9sk'
const CHART = `${SONG}/std/remaster`
// A local save with a score on each of SONG's charts: scores are the widest values in most tables
const SONG_SHEET_IDS = [
  'dsht_bx8nk4a7dj',
  'dsht_cpeg255ngz',
  'dsht_ftcsvqa843',
  'dsht_e6hz64hyhh',
  'dsht_vapnwyj8r2',
  'dsht_dcrn2j73bd',
  'dsht_7s4rs7qvtj',
  'dsht_g69s7b4pgw',
  'dsht_sp5v6rkvse',
]
const LOCAL_SAVE = JSON.stringify(SONG_SHEET_IDS.map((sheetId) => ({ sheetId, achievementRate: 100.5432 })))

// Each route with the elements on it that scroll sideways by design, by name. Anything else that scrolls sideways is
// an overflow.
const ROUTES: Record<string, Record<string, string>> = {
  '/': { 'chart cover carousel': '.snap-x' },
  '/charts/recent': {},
  '/charts/trending': {},
  '/rating': {},
  [SONG]: {},
  [CHART]: {
    'difficulty tabs': '.MuiTabs-scroller',
    'internal level by version table': '.scroll-fade-x:has(> .MuiTable-root)',
  },
  [`${CHART}/tolerance`]: {},
  '/constants': {},
  '/constants/14': {},
  '/plates': {},
  '/plates/shin-ver-kiwami': {},
  '/versions': {},
  '/versions/prism': {},
  '/tools/rating': { 'rating table': '.scroll-fade-x:has(> table)' },
  '/tools/tolerance': {},
  '/me/records': { 'filter tabs': '.MuiTabs-scroller' },
  '/me/progress': { 'progress by level table': '.scroll-fade-x-end-only' },
  '/me/recommend': {},
  '/developers': {},
  '/privacy-policy': {},
  '/terms-of-service': {},
}

function findLayoutProblems(scrollerSelectors: string[]) {
  const describe = (element: Element) => {
    const label =
      element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) ?? ''
    const className = typeof element.className === 'string' ? element.className.slice(0, 80) : ''
    return `<${element.tagName.toLowerCase()}${className ? ` class="${className}"` : ''}>${label ? ` "${label}"` : ''}`
  }
  const isShown = (element: Element) => {
    const rect = element.getBoundingClientRect()
    return (
      rect.width >= 2 && rect.height >= 2 && element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
    )
  }
  const problems: string[] = []
  const viewportWidth = document.documentElement.clientWidth

  const page = document.scrollingElement ?? document.documentElement
  if (page.scrollWidth > viewportWidth) {
    const clipped = (element: Element) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.position === 'fixed' || style.overflowX !== 'visible') return true
      }
      return getComputedStyle(element).position === 'fixed'
    }
    const sticksOut = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.right > viewportWidth + 0.5 || rect.left < -0.5
    }
    const offenders = [...document.body.querySelectorAll('*')].filter(
      (element) =>
        sticksOut(element) &&
        isShown(element) &&
        !clipped(element) &&
        !(element.parentElement && element.parentElement !== document.body && sticksOut(element.parentElement)),
    )
    problems.push(
      `the page scrolls sideways (${page.scrollWidth}px wide in a ${viewportWidth}px viewport): ${
        offenders.slice(0, 5).map(describe).join(', ') || 'no single element found'
      }`,
    )
  }

  for (const element of document.body.querySelectorAll('*')) {
    const overflowX = getComputedStyle(element).overflowX
    if (overflowX !== 'auto' && overflowX !== 'scroll') continue
    if (element.scrollWidth <= element.clientWidth + 1 || !isShown(element)) continue
    if (scrollerSelectors.some((selector) => element.matches(selector))) continue
    problems.push(
      `scrolls sideways inside ${describe(element)} (${element.scrollWidth}px of content in ${element.clientWidth}px)`,
    )
  }

  const header = document.querySelector('header')
  if (header) {
    const controls = [
      ...header.querySelectorAll('a[href], button, [role="button"], [role="tab"], input, select, textarea'),
    ].filter(isShown)
    for (const [index, a] of controls.entries()) {
      for (const b of controls.slice(index + 1)) {
        if (a.contains(b) || b.contains(a)) continue
        const ra = a.getBoundingClientRect()
        const rb = b.getBoundingClientRect()
        const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (overlapX > 1 && overlapY > 1) problems.push(`header controls overlap: ${describe(a)} and ${describe(b)}`)
      }
    }
  }
  return problems
}

async function settle(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))),
  )
}

test.describe.configure({ mode: 'parallel' })

for (const locale of LOCALES) {
  for (const [route, scrollers] of Object.entries(ROUTES)) {
    test(`${route} fits ${WIDTHS.join(', ')} px (${locale})`, async ({ page }) => {
      await page.addInitScript((entries) => localStorage.setItem('rating-calculator-entries', entries), LOCAL_SAVE)
      await page.setViewportSize({ width: WIDTHS[0], height: 800 })
      const url = locale === 'en' ? route : `/${locale}${route === '/' ? '' : route}`
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      if (route === SONG) await expect(page.getByText('100.5432%').first()).toBeVisible()

      const problems: string[] = []
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 })
        await settle(page)
        const found = await page.evaluate(findLayoutProblems, Object.values(scrollers))
        problems.push(...found.map((problem) => `${url} at ${width}px: ${problem}`))
      }
      expect(
        problems,
        'Make the element fit at that width. If it scrolls sideways by design, name it under its route in ROUTES',
      ).toEqual([])
    })
  }
}