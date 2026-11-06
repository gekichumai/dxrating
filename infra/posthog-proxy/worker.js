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
const MAX_NATIVE_BODY_BYTES = 1024 * 1024

async function readPayloadText(bytes, contentEncoding) {
  if (contentEncoding && contentEncoding.toLowerCase().includes("gzip")) {
    const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"))
    return await new Response(stream).text()
  }
  return new TextDecoder().decode(bytes)
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
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_NATIVE_BODY_BYTES) return null
  let token
  try {
    token = tokenFromPayload(await readPayloadText(bytes, request.headers.get("content-encoding")))
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
