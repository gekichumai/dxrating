import { describe, expect, it } from 'vitest'
import { NetImportError, unexpectedErrorSubtitle } from './netImportErrorFeedback'

describe('maimai NET import error feedback', () => {
  it('keeps unexpected error context for the toast subtitle', () => {
    expect(unexpectedErrorSubtitle(new Error('Upstream request timed out'))).toBe('Upstream request timed out')
    expect(
      unexpectedErrorSubtitle(new NetImportError('UNKNOWN_ERROR', 'maimai NET returned an invalid response')),
    ).toBe('maimai NET returned an invalid response')
  })

  it('does not expose implementation detail for expected account errors', () => {
    expect(unexpectedErrorSubtitle(new NetImportError('INVALID_CREDENTIALS', 'provider detail'))).toBeUndefined()
  })
})