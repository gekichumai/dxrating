import { TypeEnum } from '@gekichumai/dxdata'

export const SHEET_TYPE_IMAGES = {
  [TypeEnum.DX]: 'https://shama.dxrating.net/images/type_dx.png',
  [TypeEnum.STD]: 'https://shama.dxrating.net/images/type_sd.png',
  [TypeEnum.UTAGE]: 'https://shama.dxrating.net/images/chart-type/type_utage.png',
} satisfies Partial<Record<TypeEnum, string>>

export const SHEET_TYPE_TAB_IMAGES: Partial<Record<TypeEnum, string>> = {
  [TypeEnum.DX]: SHEET_TYPE_IMAGES[TypeEnum.DX],
  [TypeEnum.STD]: SHEET_TYPE_IMAGES[TypeEnum.STD],
}

export const SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE =
  'https://shama.dxrating.net/images/chart-type/type_utage2p_endadornment.png'

export function getSheetTypeAltTextKey(type: TypeEnum) {
  return `sheet:type-alt.${type}`
}