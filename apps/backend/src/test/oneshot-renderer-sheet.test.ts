import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { getDxdataSongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { isRenderableRatingSheet } from '../services/functions/oneshot-renderer/index.js'

describe('oneshot renderer sheet guard', () => {
  it('rejects UTAGE sheets with custom difficulty labels', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const utageSheet = catalog.sheets.find(
      (sheet) => sheet.isTypeUtage && !Object.values(DifficultyEnum).includes(sheet.difficulty as DifficultyEnum),
    )
    if (!utageSheet) throw new Error('Expected dxdata catalog to include a custom UTAGE difficulty label')

    expect(isRenderableRatingSheet(utageSheet)).toBe(false)
  })

  it('accepts rating-eligible standard sheets with enum difficulties', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const standardSheet = catalog.sheets.find(
      (sheet) => sheet.type === TypeEnum.DX && sheet.difficulty === DifficultyEnum.Master && sheet.isRatingEligible,
    )
    if (!standardSheet) throw new Error('Expected dxdata catalog to include a renderable standard sheet')

    expect(isRenderableRatingSheet(standardSheet)).toBe(true)
  })
})
