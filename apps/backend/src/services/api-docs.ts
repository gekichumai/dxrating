import { createHash } from 'node:crypto'

// The API reference at /docs: Scalar, which renders /spec.json.
//
// Scalar is pinned, and its bundle is checked against its Subresource Integrity hash: the Content-Security-Policy
// below lists exactly what this version loads, so an unpinned "latest" could start loading something the policy
// blocks, and the CDN is trusted with nothing but serving the file as it was.
export const SCALAR_VERSION = '1.76.2'
export const SCALAR_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`
export const SCALAR_SCRIPT_INTEGRITY = 'sha384-mCh2A/B6vkfhiHyzwBZm7lbFmEK5fE/96Kbtk+RH1zei1P/XEt0I2MCiG6WfZdor'

const SCALAR_INIT_SCRIPT = `Scalar.createApiReference('#app', {
  url: '/spec.json',
  authentication: {
    securitySchemes: {
      bearerAuth: {},
    },
  },
})`

// Scalar bundles Zod, which probes for eval support (`new Function`) when its object schemas are created, to compile
// faster parsers. The policy forbids eval, so the probe would only be blocked; this runs before the bundle and turns
// the compiled parsers off through the global config that Zod reads.
const ZOD_JITLESS_SCRIPT = '(globalThis.__zod_globalConfig??={}).jitless=true'

const cspHash = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`

export const API_DOCS_HTML = `<!doctype html>
<html>
  <head>
    <title>DXRating API</title>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
  </head>
  <body>
    <div id="app"></div>
    <script>${ZOD_JITLESS_SCRIPT}</script>
    <script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
    <script>${SCALAR_INIT_SCRIPT}</script>
  </body>
</html>
`

// script-src: the pinned bundle, and the two inline scripts, by their hashes.
// style-src 'unsafe-inline': Scalar (Vue) injects its stylesheet and sets style attributes at runtime.
// connect-src: 'self' for the spec, and the requests of the "Test Request" client, which go to this API; Scalar's API
// for its "Ask AI" panel.
export const API_DOCS_CSP = [
  "default-src 'none'",
  `script-src ${SCALAR_SCRIPT_URL} ${cspHash(ZOD_JITLESS_SCRIPT)} ${cspHash(SCALAR_INIT_SCRIPT)}`,
  "style-src 'unsafe-inline'",
  // Inter and the monospace font of Scalar
  'font-src https://fonts.scalar.com',
  "connect-src 'self' https://api.scalar.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** The policy of the JSON responses of the API: nothing to load, nothing to run, not to be framed */
export const API_JSON_CSP = "default-src 'none'; frame-ancestors 'none'"

export function isJsonContentType(contentType: string | null | undefined) {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase()
  return !!mediaType && (mediaType === 'application/json' || mediaType.endsWith('+json'))
}