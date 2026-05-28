import type { Asset } from '@/assetpack.gen'
import type { VersionEnum } from '@gekichumai/dxdata'
import assetpack from '@/utils/assetpack.json'

export interface Theme {
  background: {
    at1x: Asset
    at2x?: Asset
  }
  logo: Asset
  favicon: Asset
  accentColor: string
  disabled?: boolean
}

const versionKey = (value: string) => value as VersionEnum

export const DEFAULT_VERSION_THEME_KEY = versionKey('PRiSM PLUS')

export const VERSION_THEME: Partial<Record<VersionEnum, Theme>> = {
  [versionKey('FESTiVAL PLUS')]: {
    background: {
      at1x: assetpack['/images/background/festival-plus.webp'],
    },
    logo: assetpack['/images/version-logo/festival-plus.webp'],
    favicon: assetpack['/favicon/festival-plus-1024x.jpg'],
    accentColor: '#c8a8f9',
  },
  [versionKey('BUDDiES')]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
  },
  [versionKey('BUDDiES PLUS')]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies-plus.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
  },
  [versionKey('PRiSM')]: {
    background: {
      at1x: assetpack['/images/background/prism.webp'],
      at2x: assetpack['/images/background/prism@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
  },
  [versionKey('PRiSM PLUS')]: {
    background: {
      at1x: assetpack['/images/background/prism-plus.webp'],
      at2x: assetpack['/images/background/prism-plus@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
  },
  [versionKey('CiRCLE')]: {
    background: {
      at1x: assetpack['/images/background/circle.webp'],
    },
    logo: assetpack['/images/version-logo/circle.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#EF67A4',
  },
  [versionKey('CiRCLE PLUS')]: {
    background: {
      at1x: assetpack['/images/background/circle-plus.webp'],
    },
    logo: assetpack['/images/version-logo/circle-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#EF67A4',
  },
}
