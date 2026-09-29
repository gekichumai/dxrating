import type { RatingCalculatorEntry } from '../../useRatingEntries'

const BACKEND_ONESHOT_SYNC_FLAGS = new Set(['fs', 'fsp', 'fsd', 'fsdp'])

const toBackendAchievementSync = (syncFlag: string | null | undefined) => {
  if (syncFlag === 'sync') return 'sp'
  if (syncFlag === null || syncFlag === undefined || syncFlag === '' || !BACKEND_ONESHOT_SYNC_FLAGS.has(syncFlag))
    return undefined
  return syncFlag
}

export const mapCalculatedEntryForOneShot = (entry: {
  sheet: Pick<RatingCalculatorEntry['sheet'], 'id'>
  achievementRate: number
  comboFlag?: RatingCalculatorEntry['comboFlag']
  syncFlag?: string | null
}) => {
  return {
    sheetId: entry.sheet.id,
    achievementRate: entry.achievementRate,
    achievementAccuracy: entry.comboFlag ?? undefined,
    achievementSync: toBackendAchievementSync(entry.syncFlag),
  }
}