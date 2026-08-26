import { isIP } from 'node:net'
import { CHART_REPORT_SOURCE_URL_MAX_COUNT, CHART_REPORT_SOURCE_URL_MAX_LENGTH } from './chart-report-domain.js'

export const CHART_REPORT_SOURCE_URL_FAILURE_CODE = 'INVALID_SOURCE_URLS' as const

export class ChartReportSourceUrlFailure extends Error {
  readonly code = CHART_REPORT_SOURCE_URL_FAILURE_CODE

  constructor() {
    super('Chart report source URLs are invalid')
    this.name = 'ChartReportSourceUrlFailure'
  }
}

const fail = (): never => {
  throw new ChartReportSourceUrlFailure()
}

const IPV4_NON_PUBLIC_RANGES: readonly (readonly [network: number, prefixLength: number])[] = [
  [0x00000000, 8], // This network and unspecified addresses.
  [0x0a000000, 8], // Private use.
  [0x64400000, 10], // Carrier-grade NAT shared address space.
  [0x7f000000, 8], // Loopback.
  [0xa9fe0000, 16], // Link-local.
  [0xac100000, 12], // Private use.
  [0xc0000000, 24], // IETF protocol assignments.
  [0xc0000200, 24], // TEST-NET-1.
  [0xc01fc400, 24], // AS112-v4 special-purpose space.
  [0xc034c100, 24], // Automatic Multicast Tunneling special-purpose space.
  [0xc0586300, 24], // Deprecated 6to4 relay space.
  [0xc0a80000, 16], // Private use.
  [0xc0af3000, 24], // Direct Delegation AS112 service space.
  [0xc6120000, 15], // Benchmarking.
  [0xc6336400, 24], // TEST-NET-2.
  [0xcb007100, 24], // TEST-NET-3.
  [0xe0000000, 4], // Multicast.
  [0xf0000000, 4], // Reserved, including the limited broadcast address.
]

const parseIpv4 = (hostname: string): number | undefined => {
  const octets = hostname.split('.')
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
    return undefined
  }

  return octets.reduce((address, octet) => address * 256 + Number(octet), 0) >>> 0
}

const matchesIpv4Range = (address: number, network: number, prefixLength: number): boolean => {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  return (address & mask) >>> 0 === (network & mask) >>> 0
}

const parseIpv6Segments = (address: string): readonly number[] | undefined => {
  if (address.indexOf('::') !== address.lastIndexOf('::')) return undefined

  const hasCompression = address.includes('::')
  const [leftText, rightText = ''] = hasCompression ? address.split('::') : [address, '']

  const parseSide = (text: string): number[] | undefined => {
    if (text.length === 0) return []
    const segments: number[] = []
    const pieces = text.split(':')
    for (const [index, piece] of pieces.entries()) {
      if (piece.length === 0) return undefined
      if (piece.includes('.')) {
        if (index !== pieces.length - 1) return undefined
        const ipv4 = parseIpv4(piece)
        if (ipv4 === undefined) return undefined
        segments.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return undefined
      segments.push(Number.parseInt(piece, 16))
    }
    return segments
  }

  const left = parseSide(leftText)
  const right = parseSide(rightText)
  if (!left || !right) return undefined
  const explicitCount = left.length + right.length
  if ((!hasCompression && explicitCount !== 8) || (hasCompression && explicitCount >= 8)) return undefined

  return hasCompression ? [...left, ...Array<number>(8 - explicitCount).fill(0), ...right] : left
}

const parseIpv6 = (address: string): bigint | undefined => {
  const segments = parseIpv6Segments(address)
  if (!segments || segments.length !== 8) return undefined
  return segments.reduce((value, segment) => (value << 16n) | BigInt(segment), 0n)
}

const requiredIpv6 = (address: string): bigint => {
  const parsed = parseIpv6(address)
  if (parsed === undefined) throw new Error('Invalid source-controlled IPv6 range')
  return parsed
}

const IPV6_GLOBAL_UNICAST_RANGE = [requiredIpv6('2000::'), 3] as const
const IPV6_NON_PUBLIC_RANGES: readonly (readonly [network: bigint, prefixLength: number])[] = [
  [requiredIpv6('::'), 128], // Unspecified.
  [requiredIpv6('::1'), 128], // Loopback.
  [requiredIpv6('::ffff:0:0'), 96], // IPv4-mapped IPv6, including public IPv4 targets.
  [requiredIpv6('64:ff9b::'), 96], // Well-known NAT64 translation prefix.
  [requiredIpv6('64:ff9b:1::'), 48], // Local-use NAT64 translation prefix.
  [requiredIpv6('100::'), 64], // Discard-only.
  [requiredIpv6('2001::'), 23], // IETF protocol assignments, including Teredo and benchmarking.
  [requiredIpv6('2001:db8::'), 32], // Documentation.
  [requiredIpv6('2002::'), 16], // Deprecated 6to4.
  [requiredIpv6('2620:4f:8000::'), 48], // Direct Delegation AS112 service space.
  [requiredIpv6('3fff::'), 20], // Documentation.
  [requiredIpv6('5f00::'), 16], // Segment-routing SIDs special-purpose space.
  [requiredIpv6('fc00::'), 7], // Unique local.
  [requiredIpv6('fe80::'), 10], // Link-local.
  [requiredIpv6('fec0::'), 10], // Deprecated site-local space.
  [requiredIpv6('ff00::'), 8], // Multicast.
]

const matchesIpv6Range = (address: bigint, network: bigint, prefixLength: number): boolean => {
  const shift = BigInt(128 - prefixLength)
  return address >> shift === network >> shift
}

const isNonPublicIpLiteral = (hostname: string): boolean => {
  const unwrappedHostname = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  const ipVersion = isIP(unwrappedHostname)

  if (ipVersion === 4) {
    const address = parseIpv4(unwrappedHostname)
    return (
      address === undefined ||
      IPV4_NON_PUBLIC_RANGES.some(([network, prefixLength]) => matchesIpv4Range(address, network, prefixLength))
    )
  }

  if (ipVersion === 6) {
    const address = parseIpv6(unwrappedHostname)
    if (address === undefined) return true
    if (!matchesIpv6Range(address, ...IPV6_GLOBAL_UNICAST_RANGE)) return true
    return IPV6_NON_PUBLIC_RANGES.some(([network, prefixLength]) => matchesIpv6Range(address, network, prefixLength))
  }

  return false
}

const isLocalhostName = (hostname: string): boolean => {
  const canonical = hostname.toLowerCase().replace(/\.+$/, '')
  return canonical === 'localhost' || canonical.endsWith('.localhost')
}

const includesAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 0x1f || codePoint === 0x7f
  })

export const normalizePublicChartReportSourceUrl = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > CHART_REPORT_SOURCE_URL_MAX_LENGTH ||
    value !== value.trim() ||
    !value.isWellFormed() ||
    includesAsciiControlCharacter(value) ||
    value.includes('\\')
  ) {
    return fail()
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return fail()
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hostname.length === 0 ||
    isLocalhostName(parsed.hostname) ||
    isNonPublicIpLiteral(parsed.hostname)
  ) {
    return fail()
  }

  const normalized = parsed.toString()
  if (normalized.length > CHART_REPORT_SOURCE_URL_MAX_LENGTH) return fail()
  return normalized
}

export const normalizePublicChartReportSourceUrls = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length > CHART_REPORT_SOURCE_URL_MAX_COUNT) return fail()
  return Object.freeze(value.map(normalizePublicChartReportSourceUrl))
}