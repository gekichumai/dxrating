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
  console.log('Origin', request.headers.get("origin"))
  return WHITELISTED_ORIGIN_DOMAINS.includes(request.headers.get("origin"))
}

export default {
  async fetch(request, env, ctx) {
    if (!verifyOrigin(request)) {
      return new Response("Forbidden", { status: 403 })
    }
    return handleRequest(request, ctx)
  }
};
