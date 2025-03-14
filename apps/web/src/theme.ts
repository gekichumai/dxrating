import { VersionEnum } from '@gekichumai/dxdata'

export interface Theme {
  background: {
    at1x: string
    at2x?: string
  }
  logo: string
  favicon: string
  accentColor: string
  disabled?: boolean
}

export const VERSION_THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background: {
      at1x: 'https://shama.dxrating.net/images/background/festival-plus.jpg',
    },
    logo: 'https://shama.dxrating.net/images/version-logo/festival-plus.png',
    favicon: 'https://shama.dxrating.net/favicon/festival-plus-1024x.jpg',
    accentColor: '#c8a8f9',
  },
  [VersionEnum.BUDDiES]: {
    background: {
      at1x: 'https://shama.dxrating.net/images/background/buddies.jpg',
    },
    logo: 'https://shama.dxrating.net/images/version-logo/buddies.png',
    favicon: 'https://shama.dxrating.net/favicon/buddies-1024x.jpg',
    accentColor: '#FAAE29',
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: {
      at1x: 'https://shama.dxrating.net/images/background/buddies.jpg',
    },
    logo: 'https://shama.dxrating.net/images/version-logo/buddies-plus.png',
    favicon: 'https://shama.dxrating.net/favicon/buddies-1024x.jpg',
    accentColor: '#FAAE29',
  },
  [VersionEnum.PRiSM]: {
    background: {
      at1x: 'https://shama.dxrating.net/images/background/prism.jpg',
      at2x: 'https://shama.dxrating.net/images/background/prism@2x.jpg',
    },
    logo: 'https://shama.dxrating.net/images/version-logo/prism.png',
    favicon: 'https://shama.dxrating.net/favicon/prism-1024x.jpg',
    accentColor: '#6368C7',
  },
  [VersionEnum.PRiSMPLUS]: {
    background: {
      at1x: 'https://shama.dxrating.net/images/background/prism-plus.jpg',
      at2x: 'https://shama.dxrating.net/images/background/prism-plus@2x.jpg',
    },
    logo: 'https://shama.dxrating.net/images/version-logo/prism-plus.png',
    favicon: 'https://shama.dxrating.net/favicon/prism-1024x.jpg',
    accentColor: '#6368C7',
  },
}
