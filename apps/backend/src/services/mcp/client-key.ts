import { BlockList, isIP } from 'node:net'

/**
 * Cloudflare's published edge ranges, from https://www.cloudflare.com/ips/ (fetched 2026-10-30). The list changes
 * rarely; a range missing here only makes requests through it keyed by the Cloudflare edge address (coarser
 * limiting), it never makes a spoofed header trusted.
 */
export const CLOUDFLARE_IP_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const

const cloudflare = new BlockList()
for (const range of CLOUDFLARE_IP_RANGES) {
  const [network = '', prefix = ''] = range.split('/')
  cloudflare.addSubnet(network, Number(prefix), isIP(network) === 6 ? 'ipv6' : 'ipv4')
}

/** An address without brackets, zone or IPv4-mapped prefix, with its family; undefined when it is not an address */
function parseAddress(value: string | null | undefined): { address: string; family: 4 | 6 } | undefined {
  let address = value?.trim()
  if (!address) return undefined
  if (address.startsWith('[') && address.includes(']')) address = address.slice(1, address.indexOf(']'))
  address = address.replace(/%.*$/, '')
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped?.[1]) address = mapped[1]
  const family = isIP(address)
  return family === 4 || family === 6 ? { address, family } : undefined
}

export function isCloudflareAddress(value: string | null | undefined): boolean {
  const parsed = parseAddress(value)
  return !!parsed && cloudflare.check(parsed.address, parsed.family === 6 ? 'ipv6' : 'ipv4')
}

/** The /64 network of an IPv6 address, e.g. `2001:db8:1:2::/64`: one subscriber usually holds a whole /64 */
function ipv6Prefix64(address: string): string {
  const lower = address.toLowerCase()
  const [head = '', tail = ''] = lower.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = lower.includes('::')
    ? [...left, ...Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => '0'), ...right]
    : left
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/64`
}

const keyOf = (value: string | null | undefined): string | undefined => {
  const parsed = parseAddress(value)
  if (!parsed) return undefined
  return parsed.family === 6 ? ipv6Prefix64(parsed.address) : parsed.address
}

/**
 * The client of a request, for rate limiting. Production runs Cloudflare → Traefik → backend, so the socket peer is
 * Traefik, and Traefik appends the address that connected to it as the last X-Forwarded-For entry (any entries before
 * it are whatever the client sent). CF-Connecting-IP is trusted only when that hop is a Cloudflare edge address;
 * otherwise anyone reaching the origin directly could pick their own key. Without a proxy (local development) the
 * socket address is the client. IPv6 clients are keyed by their /64.
 */
export function clientKey(headers: Headers, socketAddress?: string): string {
  const address = clientAddress(headers, socketAddress)
  return keyOf(address) ?? 'unknown'
}

/** The full address of the client, by the same trust rules as clientKey; undefined when none is known */
export function clientAddress(headers: Headers, socketAddress?: string): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  const hop = forwarded ? forwarded.split(',').at(-1) : socketAddress
  if (isCloudflareAddress(hop)) {
    const client = parseAddress(headers.get('cf-connecting-ip'))
    if (client) return client.address
  }
  return parseAddress(hop)?.address ?? parseAddress(socketAddress)?.address
}