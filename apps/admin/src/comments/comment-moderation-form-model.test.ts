import { ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { validateCommentModerationReason } from './comment-moderation-form-model'

describe('comment moderation form model', () => {
  it('trims valid private reasons and preserves the maximum-length boundary', () => {
    expect(validateCommentModerationReason('  Repeated harassment evidence  ')).toEqual({
      ok: true,
      reason: 'Repeated harassment evidence',
    })
    const maximum = 'x'.repeat(ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH)
    expect(validateCommentModerationReason(maximum)).toEqual({ ok: true, reason: maximum })
  })

  it('rejects blank and oversized reasons', () => {
    expect(validateCommentModerationReason(' \n\t ')).toEqual({ ok: false, issue: 'required' })
    expect(validateCommentModerationReason('x'.repeat(ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH + 1))).toEqual({
      ok: false,
      issue: 'too-long',
    })
  })
})