export const SENTRY_SECURITY_REPORT_ENDPOINT =
  'https://o4506648698683392.ingest.us.sentry.io/api/4511398317064192/security/?sentry_key=9346c04036724f129e00a750c8ab9415'

export const SECURITY_REPORT_ENDPOINT_GROUP = 'csp-endpoint'

const REPORT_TO_MAX_AGE_SECONDS = 10886400

const CSP_DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'self'"]],
  ['form-action', ["'self'"]],
  [
    'script-src',
    [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "'wasm-unsafe-eval'",
      'https://challenges.cloudflare.com',
      'https://sql.js.org',
    ],
  ],
  ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']],
  ['font-src', ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://shama.dxrating.net']],
  [
    'img-src',
    ["'self'", 'data:', 'blob:', 'https://shama.dxrating.net', 'https://gravatar.com', 'https://*.gravatar.com'],
  ],
  [
    'connect-src',
    [
      "'self'",
      'https://miruku.dxrating.net',
      'https://razu.dxrating.net',
      'https://o4506648698683392.ingest.us.sentry.io',
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
      'https://challenges.cloudflare.com',
      'https://sql.js.org',
    ],
  ],
  ['frame-src', ["'self'", 'https://challenges.cloudflare.com']],
  ['worker-src', ["'self'", 'blob:']],
  ['child-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
  ['media-src', ["'self'", 'https://shama.dxrating.net']],
] as const

function buildContentSecurityPolicyReportOnlyHeader() {
  const policy = CSP_DIRECTIVES.map(([directive, sources]) => `${directive} ${sources.join(' ')}`)

  policy.push(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
  policy.push(`report-to ${SECURITY_REPORT_ENDPOINT_GROUP}`)

  return policy.join('; ')
}

export function buildSecurityReportHeaders() {
  return {
    'Content-Security-Policy-Report-Only': buildContentSecurityPolicyReportOnlyHeader(),
    'Report-To': JSON.stringify({
      group: SECURITY_REPORT_ENDPOINT_GROUP,
      max_age: REPORT_TO_MAX_AGE_SECONDS,
      endpoints: [{ url: SENTRY_SECURITY_REPORT_ENDPOINT }],
      include_subdomains: true,
    }),
    'Reporting-Endpoints': `${SECURITY_REPORT_ENDPOINT_GROUP}="${SENTRY_SECURITY_REPORT_ENDPOINT}"`,
  }
}

export function applySecurityReportHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(buildSecurityReportHeaders())) {
    headers.set(name, value)
  }
}