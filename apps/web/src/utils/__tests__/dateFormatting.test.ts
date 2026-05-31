import { afterEach, describe, expect, it } from 'vitest'
import { formatSheetReleaseDateParts, sheetReleaseDateTimestamp } from '../dateFormatting'

const originalTimeZone = process.env.TZ

function withTimeZone<T>(timeZone: string, callback: () => T): T {
  process.env.TZ = timeZone
  try {
    return callback()
  } finally {
    process.env.TZ = originalTimeZone
  }
}

describe('date formatting', () => {
  afterEach(() => {
    process.env.TZ = originalTimeZone
  })

  it('formats sheet release dates consistently across server and browser time zones', () => {
    const referenceTime = Date.UTC(2026, 4, 31, 12)

    const serverText = withTimeZone('Asia/Tokyo', () => formatSheetReleaseDateParts('2020-07-30', 'en', referenceTime))
    const browserText = withTimeZone('America/Los_Angeles', () =>
      formatSheetReleaseDateParts('2020-07-30', 'en', referenceTime),
    )

    expect(serverText).toEqual(browserText)
    expect(serverText.absoluteDate).toBe('Jul 30, 2020')
  })

  it('parses sheet release dates without runtime time zone drift', () => {
    const serverTimestamp = withTimeZone('Asia/Tokyo', () => sheetReleaseDateTimestamp('2020-07-30'))
    const browserTimestamp = withTimeZone('America/Los_Angeles', () => sheetReleaseDateTimestamp('2020-07-30'))

    expect(serverTimestamp).toBe(browserTimestamp)
    expect(new Date(serverTimestamp).toISOString()).toBe('2020-07-30T00:00:00.000Z')
  })
})