import { createFileRoute } from '@tanstack/react-router'

const SECURITY_TXT = `Contact: mailto:security@dxrating.net
Contact: mailto:vulnerability@dxrating.net
Expires: 2027-08-31T00:00:00Z
Encryption: https://keys.openpgp.org/vks/v1/by-fingerprint/2A13C8148A3DE89903079D9FE17343FCBF53F33F
Canonical: https://dxrating.net/.well-known/security.txt
Preferred-Languages: en, ja, zh
`

function securityTxtHeaders() {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }
}

export function buildSecurityTxt() {
  return SECURITY_TXT
}

export function createSecurityTxtResponse(includeBody = true) {
  return new Response(includeBody ? buildSecurityTxt() : null, {
    headers: securityTxtHeaders(),
  })
}

export const Route = createFileRoute('/.well-known/security.txt')({
  server: {
    handlers: {
      GET: async () => createSecurityTxtResponse(),
      HEAD: async () => createSecurityTxtResponse(false),
    },
  },
})