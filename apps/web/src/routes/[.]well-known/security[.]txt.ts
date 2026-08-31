import { createFileRoute } from '@tanstack/react-router'

const SECURITY_TXT = `Contact: mailto:vulnerability@dxrating.net
Expires: 2027-08-31T00:00:00Z
Canonical: https://dxrating.net/.well-known/security.txt
Preferred-Languages: en, ja
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