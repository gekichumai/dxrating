import type { Asset } from '@/assetpack.gen'
import { VersionEnum } from '@gekichumai/dxdata'
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

export const VERSION_THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background: {
      at1x: assetpack['/images/background/festival-plus.webp'],
    },
    logo: assetpack['/images/version-logo/festival-plus.webp'],
    favicon: assetpack['/favicon/festival-plus-1024x.jpg'],
    accentColor: '#c8a8f9',
  },
  [VersionEnum.BUDDiES]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies-plus.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
  },
  [VersionEnum.PRiSM]: {
    background: {
      at1x: assetpack['/images/background/prism.webp'],
      at2x: assetpack['/images/background/prism@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
  },
  [VersionEnum.PRiSMPLUS]: {
    background: {
      at1x: assetpack['/images/background/prism-plus.webp'],
      at2x: assetpack['/images/background/prism-plus@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
  },
  [VersionEnum.CiRCLE]: {
    background: {
      at1x: assetpack['/images/background/prism-plus.webp'],
      at2x: assetpack['/images/background/prism-plus@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
  },
}
