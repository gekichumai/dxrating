import type { Asset } from '@/assetpack.gen'
import { VersionEnum } from '@gekichumai/dxdata'
import assetpack from '@/utils/assetpack.json'

export interface Theme {
  background:
    | { kind: 'magical' }
    | {
        kind?: 'image'
        at1x: Asset
        at2x?: Asset
      }
  logo: Asset
  favicon: Asset
  canvasColor?: string
  /** The version's brand colour: decoration only (backgrounds, tints, theme-color), never text or a text-bearing fill */
  accentColor: string
  /**
   * The accent darkened in OKLCH (hue and chroma kept) until it reaches at least 4.5:1 against white and against the
   * tinted glass over the canvas: for text, links, focus rings and fills that carry white text
   */
  accentStrongColor: string
  /**
   * The dark-mode counterpart of accentStrongColor: the accent lightened in OKLCH (hue and chroma kept) until it
   * reaches at least 5.2:1 against dark glass, and 4.5:1 for the dark text that fills of it carry (--on-accent)
   */
  accentStrongDarkColor: string
  /**
   * The hover shade of dark-mode accent fills (MUI `primary.dark`, used by contained buttons): accentStrongDarkColor
   * mixed 20% toward white. Fills carry dark text, so the shade has to get lighter; MUI's derived one darkens and
   * drops to about 3.5:1 under that text
   */
  accentStrongDarkHoverColor: string
  disabled?: boolean
}

export const VERSION_THEME: Record<string, Theme> = {
  [VersionEnum.MAGiCAL]: {
    background: { kind: 'magical' },
    logo: { width: 604, height: 354, path: '/images/versions/magical/logo.webp', local: true },
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#178C72',
    accentStrongColor: '#00745b',
    accentStrongDarkColor: '#41a98e',
    accentStrongDarkHoverColor: '#67baa5',
    canvasColor: '#bdebdc',
  },
  [VersionEnum.FESTiVALPLUS]: {
    background: {
      at1x: assetpack['/images/background/festival-plus.webp'],
    },
    logo: assetpack['/images/version-logo/festival-plus.webp'],
    favicon: assetpack['/favicon/festival-plus-1024x.jpg'],
    accentColor: '#c8a8f9',
    accentStrongColor: '#7556a0',
    accentStrongDarkColor: '#c8a8f9',
    accentStrongDarkHoverColor: '#d3b9fa',
  },
  [VersionEnum.BUDDiES]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
    accentStrongColor: '#9a5400',
    accentStrongDarkColor: '#faae29',
    accentStrongDarkHoverColor: '#fbbe54',
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: {
      at1x: assetpack['/images/background/buddies.webp'],
    },
    logo: assetpack['/images/version-logo/buddies-plus.webp'],
    favicon: assetpack['/favicon/buddies-1024x.jpg'],
    accentColor: '#FAAE29',
    accentStrongColor: '#9a5400',
    accentStrongDarkColor: '#faae29',
    accentStrongDarkHoverColor: '#fbbe54',
  },
  [VersionEnum.PRiSM]: {
    background: {
      at1x: assetpack['/images/background/prism.webp'],
      at2x: assetpack['/images/background/prism@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
    accentStrongColor: '#585cba',
    accentStrongDarkColor: '#8890f3',
    accentStrongDarkHoverColor: '#a0a6f5',
  },
  [VersionEnum.PRiSMPLUS]: {
    background: {
      at1x: assetpack['/images/background/prism-plus.webp'],
      at2x: assetpack['/images/background/prism-plus@2x.webp'],
    },
    logo: assetpack['/images/version-logo/prism-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#6368C7',
    accentStrongColor: '#585cba',
    accentStrongDarkColor: '#8890f3',
    accentStrongDarkHoverColor: '#a0a6f5',
  },
  [VersionEnum.CiRCLE]: {
    background: {
      at1x: assetpack['/images/background/circle.webp'],
    },
    logo: assetpack['/images/version-logo/circle.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#EF67A4',
    accentStrongColor: '#b53172',
    accentStrongDarkColor: '#f169a6',
    accentStrongDarkHoverColor: '#f487b8',
  },
  [VersionEnum.CiRCLEPLUS]: {
    background: {
      at1x: assetpack['/images/background/circle-plus.webp'],
    },
    logo: assetpack['/images/version-logo/circle-plus.webp'],
    favicon: assetpack['/favicon/prism-1024x.jpg'],
    accentColor: '#EF67A4',
    accentStrongColor: '#b53172',
    accentStrongDarkColor: '#f169a6',
    accentStrongDarkHoverColor: '#f487b8',
  },
}