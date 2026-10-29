export const SENTRY_SECURITY_REPORT_ENDPOINT =
  'https://o4506648698683392.ingest.us.sentry.io/api/4511398317064192/security/?sentry_key=9346c04036724f129e00a750c8ab9415'

export const SECURITY_REPORT_ENDPOINT_GROUP = 'csp-endpoint'

const REPORT_TO_MAX_AGE_SECONDS = 10886400

// Enforced since 2026-10 after running in Report-Only mode from 2026-05.
//
// script-src: every inline script on the page is rendered by TanStack Router (dehydrated state, stream barrier, the
// module entry) and carries the per-request nonce (router `ssr.nonce`, see router.tsx). 'unsafe-inline' only remains
// as a fallback for browsers without nonce support (CSP Level 1): browsers that understand the nonce ignore it.
// 'wasm-unsafe-eval' lets sql.js compile its WebAssembly module (Aqua SQLite import); nothing on the client needs
// 'unsafe-eval' (zod's eval probe is turned off with `jitless`, see zod-jitless.ts).
//
// style-src keeps 'unsafe-inline': Emotion (MUI) injects <style> elements at runtime and components use style
// attributes, neither of which can carry a nonce. A nonce must therefore never be added to style-src, where it
// would disable 'unsafe-inline'.
//
// frame-ancestors 'none' matches X-Frame-Options: DENY, which browsers already enforce.
const CSP_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  [
    'script-src',
    [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      // Turnstile
      'https://challenges.cloudflare.com',
      // PostHog (reverse proxy): remote config and lazily loaded extensions
      'https://razu.dxrating.net',
    ],
  ],
  ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']],
  ['font-src', ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://shama.dxrating.net']],
  [
    'img-src',
    [
      "'self'",
      'data:',
      'blob:',
      'https://shama.dxrating.net',
      'https://gravatar.com',
      'https://avatars.githubusercontent.com',
      'https://lh3.googleusercontent.com',
    ],
  ],
  [
    'connect-src',
    [
      "'self'",
      'https://miruku.dxrating.net',
      'https://razu.dxrating.net',
      'https://shama.dxrating.net',
      'https://www.diving-fish.com',
      'https://challenges.cloudflare.com',
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ],
  ],
  ['frame-src', ["'self'", 'https://challenges.cloudflare.com']],
  ['worker-src', ["'self'", 'blob:']],
  ['child-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
  ['media-src', ["'self'", 'https://shama.dxrating.net']],
] as const

export interface SecurityHeaderOptions {
  /** The per-request nonce of the inline scripts of the page, if it renders any */
  nonce?: string
}

/** A fresh nonce for the Content-Security-Policy of one response: 128 random bits, base64 */
export function createCspNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function buildContentSecurityPolicy({
  nonce,
  strictDynamic = false,
}: SecurityHeaderOptions & { strictDynamic?: boolean } = {}) {
  const policy = CSP_DIRECTIVES.map(([directive, sources]) => {
    const allSources: string[] = [...sources]
    if (directive === 'script-src' && nonce) {
      allSources.splice(1, 0, `'nonce-${nonce}'`, ...(strictDynamic ? ["'strict-dynamic'"] : []))
    }
    return `${directive} ${allSources.join(' ')}`
  })

  policy.push(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
  policy.push(`report-to ${SECURITY_REPORT_ENDPOINT_GROUP}`)

  return policy.join('; ')
}

export function buildSecurityHeaders(options: SecurityHeaderOptions = {}) {
  const headers: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'Report-To': JSON.stringify({
      group: SECURITY_REPORT_ENDPOINT_GROUP,
      max_age: REPORT_TO_MAX_AGE_SECONDS,
      endpoints: [{ url: SENTRY_SECURITY_REPORT_ENDPOINT }],
      include_subdomains: true,
    }),
    'Reporting-Endpoints': `${SECURITY_REPORT_ENDPOINT_GROUP}="${SENTRY_SECURITY_REPORT_ENDPOINT}"`,
  }

  // Trial of 'strict-dynamic' (scripts are trusted by nonce, and the scripts they load, rather than by host), in
  // Report-Only mode beside the enforced policy: it passed a headless browse of the app, but reports from real
  // browsers should come back clean before it is enforced.
  if (options.nonce) {
    headers['Content-Security-Policy-Report-Only'] = buildContentSecurityPolicy({ ...options, strictDynamic: true })
  }

  return headers
}

export function applySecurityHeaders(headers: Headers, options: SecurityHeaderOptions = {}) {
  for (const [name, value] of Object.entries(buildSecurityHeaders(options))) {
    headers.set(name, value)
  }
}