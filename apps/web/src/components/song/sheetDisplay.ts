import { type DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SupportedLocale } from '@/setup/locale'
import { DIFFICULTIES } from '../../models/difficulties'

type SheetTypeDisplayNames = Record<TypeEnum, string>

export const SHEET_TYPE_DISPLAY_NAMES: Record<SupportedLocale, SheetTypeDisplayNames> = {
  en: {
    [TypeEnum.DX]: 'DX',
    [TypeEnum.STD]: 'Standard',
    [TypeEnum.UTAGE]: 'Utage',
    [TypeEnum.UTAGE2P]: 'Utage',
  },
  'zh-Hans': {
    [TypeEnum.DX]: 'DX',
    [TypeEnum.STD]: '标准',
    [TypeEnum.UTAGE]: '宴',
    [TypeEnum.UTAGE2P]: '宴',
  },
  'zh-Hant': {
    [TypeEnum.DX]: 'DX',
    [TypeEnum.STD]: '標準',
    [TypeEnum.UTAGE]: '宴',
    [TypeEnum.UTAGE2P]: '宴',
  },
  ja: {
    [TypeEnum.DX]: 'でらっくす',
    [TypeEnum.STD]: 'スタンダード',
    [TypeEnum.UTAGE]: '宴',
    [TypeEnum.UTAGE2P]: '宴',
  },
}

export const SHEET_TYPE_TAB_IMAGES: Partial<Record<TypeEnum, string>> = {
  [TypeEnum.DX]: 'https://shama.dxrating.net/images/type_dx.png',
  [TypeEnum.STD]: 'https://shama.dxrating.net/images/type_sd.png',
}

export function getSheetTypeDisplayName(type: TypeEnum, locale: SupportedLocale = 'en') {
  return SHEET_TYPE_DISPLAY_NAMES[locale][type] ?? SHEET_TYPE_DISPLAY_NAMES.en[type]
}

export function getSheetTitleLabel(
  sheet: {
    type: TypeEnum
    difficulty: DifficultyEnum | string
  },
  locale: SupportedLocale = 'en',
) {
  return `${getSheetTypeDisplayName(sheet.type, locale)} ${DIFFICULTIES[sheet.difficulty as DifficultyEnum]?.title ?? sheet.difficulty}`
}

export function getSheetPageTitle(
  song: {
    title: string
  },
  sheet: {
    type: TypeEnum
    difficulty: DifficultyEnum | string
  },
  locale: SupportedLocale = 'en',
) {
  return `${song.title} [${getSheetTitleLabel(sheet, locale)}] - DXRating`
}