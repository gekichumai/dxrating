import type { RatingCalculatorEntry } from '../../useRatingEntries'

const BACKEND_ONESHOT_SYNC_FLAGS = new Set(['fs', 'fsp', 'fsd', 'fsdp'])

const toBackendAchievementSync = (syncFlag: RatingCalculatorEntry['syncFlag']) => {
  if (syncFlag === 'sync') return 'sp'
  if (!syncFlag || !BACKEND_ONESHOT_SYNC_FLAGS.has(syncFlag)) return undefined
  return syncFlag
}

export const mapCalculatedEntryForOneShot = (entry: RatingCalculatorEntry) => {
  return {
    sheetId: entry.sheet.id,
    achievementRate: entry.achievementRate,
    achievementAccuracy: entry.comboFlag ?? undefined,
    achievementSync: toBackendAchievementSync(entry.syncFlag),
  }
}