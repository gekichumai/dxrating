import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { localizePath } from '../src/setup/locale'
import { collectPageErrors, waitForHydration } from './hydration'

// The server renders in UTC and en-US. The skewed clock stands for HTML the edge cache rendered earlier: a first render
// that reads the clock instead of the rendered-at time then differs in any time zone. The browser locales are ones the
// site doesn't offer, so the unprefixed URLs still serve English.

type CatalogSong = { id: string; sheets: { id: string; type: string; difficulty: string }[] }
const { songs } = JSON.parse(
  readFileSync(fileURLToPath(import.meta.resolve('@gekichumai/dxdata/snapshot.json')), 'utf8'),
) as { songs: CatalogSong[] }

const song = songs.find((candidate) => candidate.sheets.some((s) => s.type === 'dx' && s.difficulty === 'master'))!
const sheetPath = `/songs/${song.id}/dx/master`

const PAGES: Record<string, string> = {
  'index.tsx': '/',
  'search.tsx': '/search?q=oshama',
  'songs_.$songId.tsx': `/songs/${song.id}`,
  'songs/$songId/$type/$difficulty.tsx': sheetPath,
  'songs/$songId/$type/$difficulty_.tolerance.tsx': `${sheetPath}/tolerance`,
  '$songId/$type/$difficulty.tsx': `/${song.id}/dx/master`,
  'charts/recent.tsx': '/charts/recent',
  'charts/trending.tsx': '/charts/trending',
  'constants/index.tsx': '/constants',
  'constants/$level.tsx': '/constants/14p',
  'versions/index.tsx': '/versions',
  'versions/$version.tsx': '/versions/magical',
  'plates/index.tsx': '/plates',
  'plates/$plate.tsx': '/plates/geki-kiwami',
  'rating.tsx': '/rating',
  'tools/rating.tsx': '/tools/rating',
  'tools/tolerance.tsx': '/tools/tolerance',
  'random.tsx': '/random',
  'me/progress.tsx': '/me/progress',
  'me/records.tsx': '/me/records',
  'me/recommend.tsx': '/me/recommend',
  'account/security.tsx': '/account/security',
  'developers.tsx': '/developers',
  'privacy-policy.tsx': '/privacy-policy',
  'terms-of-service.tsx': '/terms-of-service',
}

const PROFILES = [
  {
    name: 'phone',
    use: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      timezoneId: 'Pacific/Kiritimati',
      locale: 'de-DE',
    },
    layout: 'grid',
  },
  {
    name: 'desktop',
    use: { viewport: { width: 1280, height: 800 }, timezoneId: 'Pacific/Pago_Pago', locale: 'fr-FR' },
    layout: 'list',
  },
] as const

const LOCALES = ['en', 'ja'] as const
const CLOCK_SKEW_MS = 36 * 60 * 60 * 1000

const sheetIds = songs.flatMap((s) => s.sheets.map((sheet) => sheet.id))
const savedState = (layout: string): Record<string, string> => ({
  'app-context': JSON.stringify({ version: 'circle', region: 'intl' }),
  'rating-calculator-entries': JSON.stringify(
    sheetIds.map((sheetId, index) => ({
      sheetId,
      achievementRate: [100.5, 100.8, 99.5, 97.2][index % 4],
      comboFlag: ['fc', 'ap', 'fcp', null][index % 4],
      syncFlag: ['fs', null, 'fsd', 'sync'][index % 4],
    })),
  ),
  'favorite-sheets': JSON.stringify(sheetIds.slice(0, 20)),
  'sheet-list-layout': layout,
  'dxrating-theme': 'dark',
})

test('every page route is in the matrix', () => {
  const routesDir = fileURLToPath(new URL('../src/routes', import.meta.url))
  const pageRoutes = readdirSync(routesDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx') && !/(^|\/)(-|__)/.test(file))
    .filter((file) => !/ssr:\s*false/.test(readFileSync(`${routesDir}/${file}`, 'utf8')))
  expect(Object.keys(PAGES).sort()).toEqual(pageRoutes.sort())
})

for (const profile of PROFILES) {
  test.describe(profile.name, () => {
    test.describe.configure({ mode: 'parallel' })
    test.use(profile.use)

    for (const locale of LOCALES) {
      for (const path of Object.values(PAGES)) {
        test(`${locale} ${path}`, async ({ page, baseURL }) => {
          const origin = new URL(baseURL!).origin
          await page.route(
            (url) => url.origin !== origin,
            (route) => route.abort('blockedbyclient'),
          )
          await page.route('**/monitoring/tunnel**', (route) => route.fulfill({ status: 200, body: '' }))
          await page.clock.setSystemTime(Date.now() + CLOCK_SKEW_MS)
          await page.addInitScript((state) => {
            for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value)
          }, savedState(profile.layout))
          const errors = collectPageErrors(page)

          await page.goto(localizePath(path, locale))
          await waitForHydration(page)

          expect(errors, `${profile.name} ${locale} ${path}`).toEqual([])
        })
      }
    }
  })
}