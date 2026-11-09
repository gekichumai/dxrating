/**
 * The requests Sentry adds its trace headers (`sentry-trace`, `baggage`) to: this site and the API. Not the song
 * catalog and its community overlay (`/api/v1/dxdata`, `/api/v2/dxdata`, `/api/v2/dxdata/community`): their CORS
 * preflight allows only Content-Type, If-None-Match and X-DXRating-Client, so a trace header makes the browser refuse
 * the request.
 */
export const TRACE_PROPAGATION_TARGETS: (string | RegExp)[] = [
  'localhost',
  /^\//,
  /^https?:\/\/dxrating\.net/,
  /^https?:\/\/miruku\.dxrating\.net\/(?!api\/v\d+\/dxdata(?:[/?#]|$))/,
]