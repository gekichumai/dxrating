import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { groupUserRecords } from '@/models/userRecords'
import { CompletionBadges } from '../CompletionBadges'
import { SYNC_LABELS } from '../completion'

describe('CompletionBadges with duplicate records', () => {
  it('shows flags earned in a lower-scoring play (the merged best record)', () => {
    const sheetId = 'dsht_8rsgpcbmn6'
    const record = groupUserRecords(
      [
        { sheetId, achievementRate: 100.1, comboFlag: 'fc', syncFlag: null },
        { sheetId, achievementRate: 99.9, comboFlag: 'ap', syncFlag: 'fsd' },
      ],
      () => null,
    ).get(sheetId)!
    const { container } = render(<CompletionBadges record={record.best} />)
    const text = container.textContent ?? ''
    expect(text).toContain('AP')
    expect(text).not.toMatch(/FC(?!\+)/)
    expect(text).toContain(SYNC_LABELS.fsd)
  })
})