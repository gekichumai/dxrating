import type { SongCatalog } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { detectAnalyticsDeployment, detectAnalyticsPlatform } from '@/lib/analytics'

/** `?demoScores=1` loads these fixture scores (dev and preview hosts only) for screenshots and tests */
export const DEMO_SCORES_QUERY_PARAM = 'demoScores'

/** Whether a URL asks for demo scores and is allowed to: never on the production host or in the native shell */
export function isDemoScoresEnabled(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.get(DEMO_SCORES_QUERY_PARAM) !== '1') return false
    return detectAnalyticsDeployment(url, detectAnalyticsPlatform(url)) !== 'production'
  } catch {
    return false
  }
}

/** Small deterministic PRNG (mulberry32) so the fixture is identical on every load */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ACHIEVEMENT_STEPS = [100.8, 100.6, 100.52, 100.3, 100.1, 99.7, 99.3, 98.6, 97.4, 95.2, 91.0, 84.5]

/**
 * A fixture of plausible scores over the catalog: about a fifth of the rating-eligible standard sheets, harder
 * sheets getting lower achievements, with a mix of combo and sync flags. Deterministic for a given catalog.
 */
export function buildDemoScores(catalog: Pick<SongCatalog, 'sheets'>, seed = 20261102): PlayEntry[] {
  const random = mulberry32(seed)
  const entries: PlayEntry[] = []
  for (const sheet of catalog.sheets) {
    if (!sheet.isRatingEligible || random() > 0.22) continue
    const difficultyPenalty = Math.max(0, sheet.internalLevelValue - 11) * 0.9
    const step = Math.min(ACHIEVEMENT_STEPS.length - 1, Math.floor(random() * 4 + difficultyPenalty))
    const achievementRate = ACHIEVEMENT_STEPS[step]!
    const roll = random()
    const comboFlag =
      achievementRate >= 100.5 && roll < 0.35
        ? roll < 0.12
          ? 'app'
          : 'ap'
        : achievementRate >= 99.5 && roll < 0.7
          ? roll < 0.5
            ? 'fcp'
            : 'fc'
          : null
    const syncRoll = random()
    const syncFlag = comboFlag && syncRoll < 0.3 ? (syncRoll < 0.1 ? 'fsdp' : 'fsd') : syncRoll < 0.5 ? 'fs' : null
    entries.push({ sheetId: sheet.id, identity: sheet.identity, achievementRate, comboFlag, syncFlag })
  }
  return entries
}