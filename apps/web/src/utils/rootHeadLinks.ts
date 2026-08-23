import type { JSX } from 'react'
import { buildAlternateLinks } from '@/utils/alternateLinks'
import appCss from '@/index.css?url'

type RootHeadLocation = {
  pathname: string
  search?: Record<string, unknown>
}

type HeadLink = JSX.IntrinsicElements['link']

export const buildRootHeadLinks = ({ pathname, search }: RootHeadLocation): HeadLink[] => [
  { rel: 'preconnect', href: 'https://shama.dxrating.net' },
  { rel: 'stylesheet', href: appCss },
  {
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href: 'https://shama.dxrating.net/fonts/Torus-Regular.woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href: 'https://shama.dxrating.net/fonts/Torus-SemiBold.woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    as: 'image',
    href: 'https://shama.dxrating.net/images/version-logo/circle-plus.webp',
    fetchPriority: 'high',
  },
  ...buildAlternateLinks({ pathname, search }),
  { rel: 'preconnect', href: 'https://miruku.dxrating.net' },
  {
    rel: 'apple-touch-icon',
    sizes: '180x180',
    href: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: 'https://shama.dxrating.net/favicon/pack/v1/favicon-32x32.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '16x16',
    href: 'https://shama.dxrating.net/favicon/pack/v1/favicon-16x16.png',
  },
  {
    rel: 'mask-icon',
    href: 'https://shama.dxrating.net/favicon/pack/v1/safari-pinned-tab.svg',
    color: '#c8a8f9',
  },
  {
    rel: 'shortcut icon',
    href: 'https://shama.dxrating.net/favicon/pack/v1/favicon.ico',
  },
  {
    rel: 'search',
    type: 'application/opensearchdescription+xml',
    title: 'DXRating Search',
    href: 'https://dxrating.net/opensearch.xml',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
]