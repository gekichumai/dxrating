import { describe, expect, it } from 'vitest'
import { mapCalculatedEntryForOneShot } from '../oneshotPayload'
import type { RatingCalculatorEntry } from '../../../useRatingEntries'

const makeEntry = ({
  comboFlag,
  syncFlag,
}: {
  comboFlag?: RatingCalculatorEntry['comboFlag']
  syncFlag?: RatingCalculatorEntry['syncFlag']
}): RatingCalculatorEntry =>
  ({
    sheet: {
      id: 'sheet-id',
    },
    achievementRate: 100.5,
    comboFlag,
    syncFlag,
  }) as RatingCalculatorEntry

describe('mapCalculatedEntryForOneShot', () => {
  it('maps combo and backend-supported sync flags into the oneshot payload', () => {
    expect(mapCalculatedEntryForOneShot(makeEntry({ comboFlag: 'app', syncFlag: 'fsdp' }))).toEqual({
      sheetId: 'sheet-id',
      achievementRate: 100.5,
      achievementAccuracy: 'app',
      achievementSync: 'fsdp',
    })
  })

  it('maps the web sync flag to the backend sp badge', () => {
    expect(mapCalculatedEntryForOneShot(makeEntry({ comboFlag: 'ap', syncFlag: 'sync' }))).toEqual({
      sheetId: 'sheet-id',
      achievementRate: 100.5,
      achievementAccuracy: 'ap',
      achievementSync: 'sp',
    })
  })

  it('omits unsupported sync values from the backend payload', () => {
    expect(
      mapCalculatedEntryForOneShot({
        ...makeEntry({ comboFlag: 'ap' }),
        syncFlag: 'unsupported' as unknown as RatingCalculatorEntry['syncFlag'],
      }),
    ).toEqual({
      sheetId: 'sheet-id',
      achievementRate: 100.5,
      achievementAccuracy: 'ap',
      achievementSync: undefined,
    })
  })
})