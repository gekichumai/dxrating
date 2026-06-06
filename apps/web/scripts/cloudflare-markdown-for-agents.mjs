const API_BASE_URL = 'https://api.cloudflare.com/client/v4'
const DEFAULT_ZONE_NAME = 'dxrating.net'
const DEFAULT_VERIFY_URL = 'https://dxrating.net/search'

const command = process.argv[2]

if (!command || !['enable', 'verify'].includes(command)) {
  console.error('Usage: node scripts/cloudflare-markdown-for-agents.mjs <enable|verify> [url]')
  process.exit(1)
}

async function cloudflareFetch(path, init = {}) {
  const token = process.env.CLOUDFLARE_ZONE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_ZONE_API_TOKEN or CLOUDFLARE_API_TOKEN is required')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors) ? body.errors : []
    const message = errors.map((error) => error.message).join('; ') || response.statusText
    throw new Error(`Cloudflare API request failed: ${message}`)
  }

  return body
}

async function resolveZoneId() {
  if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID

  const zoneName = process.env.CLOUDFLARE_ZONE_NAME || DEFAULT_ZONE_NAME
  const body = await cloudflareFetch(`/zones?name=${encodeURIComponent(zoneName)}&status=active`, {
    method: 'GET',
    headers: {},
  })
  const zoneId = body.result?.[0]?.id
  if (!zoneId) throw new Error(`No active Cloudflare zone found for ${zoneName}`)

  return zoneId
}

async function enableMarkdownForAgents() {
  const zoneId = await resolveZoneId()
  const body = await cloudflareFetch(`/zones/${zoneId}/settings/content_converter`, {
    method: 'PATCH',
    body: JSON.stringify({ value: 'on' }),
  })
  const value = body.result?.value

  if (value !== 'on') throw new Error(`Markdown for Agents was not enabled; content_converter=${value ?? 'unknown'}`)

  console.log(`Markdown for Agents enabled for zone ${zoneId}`)
}

async function verifyMarkdownForAgents() {
  const url = process.argv[3] || process.env.MARKDOWN_FOR_AGENTS_URL || DEFAULT_VERIFY_URL
  const response = await fetch(url, { headers: { Accept: 'text/markdown' }, redirect: 'follow' })
  const contentType = response.headers.get('content-type') || ''
  const markdownTokens = response.headers.get('x-markdown-tokens')

  if (!response.ok) throw new Error(`Expected 2xx markdown response from ${url}; got ${response.status}`)
  if (!contentType.toLowerCase().startsWith('text/markdown')) {
    throw new Error(`Expected Content-Type text/markdown from ${url}; got ${contentType || 'missing'}`)
  }

  console.log(`Verified ${url}`)
  console.log(`Content-Type: ${contentType}`)
  if (markdownTokens) console.log(`x-markdown-tokens: ${markdownTokens}`)
}

try {
  if (command === 'enable') await enableMarkdownForAgents()
  if (command === 'verify') await verifyMarkdownForAgents()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
