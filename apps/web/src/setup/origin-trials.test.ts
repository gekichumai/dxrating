import { describe, expect, it } from 'vitest'
import { originTrialMeta } from './origin-trials'

describe('originTrialMeta', () => {
  it('emits a tag per configured token and nothing without one', () => {
    expect(originTrialMeta([' token-a '])).toEqual([{ httpEquiv: 'origin-trial', content: 'token-a' }])
    expect(originTrialMeta([undefined, ''])).toEqual([])
  })
})