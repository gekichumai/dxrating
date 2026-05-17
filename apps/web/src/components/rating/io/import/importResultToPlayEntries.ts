import type { RatingImportResult } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export function importResultToPlayEntries(result: RatingImportResult): PlayEntry[] {
  return result.entries.map((entry) => ({
    sheetId: entry.sheetId,
    identity: entry.identity,
    achievementRate: entry.achievementRate,
    comboFlag: entry.comboFlag,
    syncFlag: entry.syncFlag,
    source: entry.source,
    providerConfig:
      entry.source?.provider === 'diving-fish'
        ? {
            divingFish: {
              ratingEligibility: entry.source.best50Bucket ?? null,
            },
          }
        : undefined,
  }))
}