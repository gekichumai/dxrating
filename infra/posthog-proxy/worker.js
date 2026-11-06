const API_HOST = "us.i.posthog.com" // Change to "eu.i.posthog.com" for the EU region
const ASSET_HOST = "us-assets.i.posthog.com" // Change to "eu-assets.i.posthog.com" for the EU region

async function handleRequest(request, ctx) {
  const url = new URL(request.url)
  const pathname = url.pathname
  const search = url.search
  const pathWithParams = pathname + search

  if (pathname.startsWith("/static/")) {
      return retrieveStatic(request, pathWithParams, ctx)
  } else {
      return forwardRequest(request, pathWithParams)
  }
}

async function retrieveStatic(request, pathname, ctx) {
  let response = await caches.default.match(request)
  if (!response) {
      response = await fetch(`https://${ASSET_HOST}${pathname}`)
      ctx.waitUntil(caches.default.put(request, response.clone()))
  }
  return response
}

async function forwardRequest(request, pathWithSearch) {
  const originRequest = new Request(request)
  originRequest.headers.delete("cookie")
  return await fetch(`https://${API_HOST}${pathWithSearch}`, originRequest)
}

const WHITELISTED_ORIGIN_DOMAINS = [
  "https://dxrating.net",
  "https://dxrating.imgg.dev",
  "https://rotaeno.imgg.dev",
  "http://localhost:5173",
  "capacitor://localhost"
]
function verifyOrigin(request) {
  return WHITELISTED_ORIGIN_DOMAINS.includes(request.headers.get("origin"))
}

// Native apps (posthog-ios) send no Origin header, so the allow-list above
// rejected every iOS event. A request without an Origin is let through only
// when its body carries this project's token; browsers always send an Origin
// on these cross-origin POSTs, so other websites still hit the allow-list.
const PROJECT_TOKEN = "phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7"
// Both limits are enforced while the stream is read, so an oversized upload or
// a gzip bomb is cancelled instead of being buffered or expanded in full.
const MAX_NATIVE_BODY_BYTES = 1024 * 1024
const MAX_DECODED_BODY_BYTES = 4 * 1024 * 1024

// Reads at most `limit` bytes from `stream`. Returns null, after cancelling the
// stream, as soon as it yields more than that.
async function readLimited(stream, limit) {
  const reader = stream.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function readPayloadText(bytes, contentEncoding) {
  let decoded = bytes
  if (contentEncoding && contentEncoding.toLowerCase().includes("gzip")) {
    const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"))
    decoded = await readLimited(stream, MAX_DECODED_BODY_BYTES)
    if (!decoded) return null
  }
  return new TextDecoder().decode(decoded)
}

function tokenFromPayload(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    // posthog-js style form body: data=<base64 JSON>
    const data = new URLSearchParams(text).get("data")
    if (!data) return null
    try {
      payload = JSON.parse(atob(data))
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== "object") return null
  return payload.api_key ?? payload.token ?? null
}

// Returns a request with the same body when the no-Origin request carries
// this project's token, or null to reject it.
async function verifyNativeRequest(request) {
  if (request.headers.has("origin") || request.method !== "POST") return null
  const declaredLength = Number(request.headers.get("content-length"))
  if (declaredLength > MAX_NATIVE_BODY_BYTES) return null
  if (!request.body) return null
  let token
  let bytes
  try {
    bytes = await readLimited(request.body, MAX_NATIVE_BODY_BYTES)
    if (!bytes || bytes.byteLength === 0) return null
    const text = await readPayloadText(bytes, request.headers.get("content-encoding"))
    if (text === null) return null
    token = tokenFromPayload(text)
  } catch {
    return null
  }
  if (token !== PROJECT_TOKEN) return null
  return new Request(request, { body: bytes })
}

export default {
  async fetch(request, env, ctx) {
    if (verifyOrigin(request)) {
      return handleRequest(request, ctx)
    }
    const nativeRequest = await verifyNativeRequest(request)
    if (nativeRequest) {
      return handleRequest(nativeRequest, ctx)
    }
    return new Response("Forbidden", { status: 403 })
  }
};
