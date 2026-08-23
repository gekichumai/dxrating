import { z } from 'zod'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '::1', '[::1]'])

const isIpv4Loopback = (hostname: string): boolean => {
  const octets = hostname.split('.')
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  )
}

export const isLoopbackHostname = (hostname: string): boolean =>
  LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || isIpv4Loopback(hostname)

export const normalizeExactWebOrigin = (value: string): string => {
  if (value.includes('*') || value.includes('?')) {
    throw new Error('wildcards and patterns are not allowed')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('must be an absolute URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('must use http or https')
  }
  if (parsed.username || parsed.password) {
    throw new Error('must not contain user information')
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('must contain only an origin')
  }

  return parsed.origin
}

export const ExactWebOriginSchema = z.string().transform((value, context) => {
  try {
    return normalizeExactWebOrigin(value)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'must be an exact web origin',
    })
    return z.NEVER
  }
})

export const ExactWebOriginListSchema = z.preprocess((value) => {
  if (value === undefined || value === '') return []
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, z.array(ExactWebOriginSchema).max(50))

export const uniqueOrigins = (origins: readonly string[]): string[] => [...new Set(origins)]

export const isAllowedExactOrigin = (origin: string | undefined, allowedOrigins: ReadonlySet<string>): boolean =>
  origin !== undefined && allowedOrigins.has(origin)