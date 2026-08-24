export const DEFAULT_ADMIN_BACKEND_ORIGIN = 'http://localhost:5174' as const

export type AdminBackendEnvironment = {
  readonly mode: string
  readonly configuredOrigin?: string
}

const isIpv4Loopback = (hostname: string): boolean => {
  const octets = hostname.split('.')
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  )
}

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '::1' ||
  hostname === '[::1]' ||
  hostname.endsWith('.localhost') ||
  isIpv4Loopback(hostname)

export const validateAdminBackendOrigin = (value: string, mode: string): string => {
  const candidate = value.trim()
  let parsed: URL

  if (
    candidate.includes('*') ||
    candidate.includes('?') ||
    candidate.includes('#') ||
    !/^[a-z][a-z\d+.-]*:\/\/[^/?#]+\/?$/i.test(candidate)
  ) {
    throw new Error('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
  }

  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
  }

  if (parsed.protocol === 'http:' && mode !== 'development' && mode !== 'test') {
    throw new Error('VITE_BACKEND_URL must use HTTPS outside development and test')
  }

  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new Error('VITE_BACKEND_URL may use HTTP only with an exact loopback origin')
  }

  return parsed.origin
}

export const resolveAdminBackendOrigin = ({ mode, configuredOrigin }: AdminBackendEnvironment): string => {
  if (configuredOrigin?.trim()) return validateAdminBackendOrigin(configuredOrigin, mode)
  if (mode === 'development' || mode === 'test') return DEFAULT_ADMIN_BACKEND_ORIGIN

  throw new Error('VITE_BACKEND_URL is required outside development and test')
}

export const resolveAdminBackendOriginFromEnv = (
  environment: Pick<ImportMetaEnv, 'MODE' | 'VITE_BACKEND_URL'> = import.meta.env,
): string =>
  resolveAdminBackendOrigin({
    mode: environment.MODE,
    configuredOrigin: environment.VITE_BACKEND_URL,
  })