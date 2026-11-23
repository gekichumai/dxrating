import { pathsRefusingHeader, TRACE_HEADERS } from '@gekichumai/api-contract'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const untraced = [...new Set(TRACE_HEADERS.flatMap(pathsRefusingHeader))].map(escapeRegExp).join('|')

/** The requests Sentry adds its trace headers to: this site, and the API paths whose CORS preflight allows them */
export const TRACE_PROPAGATION_TARGETS: (string | RegExp)[] = [
  /^\//,
  /^https?:\/\/dxrating\.net/,
  new RegExp(`^https?://(?:miruku\\.dxrating\\.net|localhost(?::\\d+)?)(?=/)(?!(?:${untraced})(?:[?#]|$))`),
]