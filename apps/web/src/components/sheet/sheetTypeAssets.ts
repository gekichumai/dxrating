import { TypeEnum } from '@gekichumai/dxdata'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'

export const SHEET_TYPE_IMAGES = {
  [TypeEnum.DX]: 'https://shama.dxrating.net/images/type_dx.png',
  [TypeEnum.STD]: 'https://shama.dxrating.net/images/type_sd.png',
  [TypeEnum.UTAGE]: 'https://shama.dxrating.net/images/chart-type/type_utage.png',
} satisfies Partial<Record<TypeEnum, string>>

export const SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE =
  'https://shama.dxrating.net/images/chart-type/type_utage2p_endadornment.png'

const SHEET_TYPE_ALT_TEXTS = {
  [TypeEnum.DX]: m.sheet_typeAlt_dx,
  [TypeEnum.STD]: m.sheet_typeAlt_std,
  [TypeEnum.UTAGE]: m.sheet_typeAlt_utage,
  [TypeEnum.UTAGE2P]: m.sheet_typeAlt_utage2p,
} satisfies Record<TypeEnum, PlainMessage>

export function getSheetTypeAltText(type: TypeEnum, locale: SupportedLocale) {
  return SHEET_TYPE_ALT_TEXTS[type]({}, { locale })
}