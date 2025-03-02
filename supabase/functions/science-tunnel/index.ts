import { serve } from 'https://deno.land/std@0.175.0/http/server.ts'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Max-Age': '86400',
  }
  const SENTRY_HOST = 'o4506648698683392.ingest.sentry.io'
  const SENTRY_PROJECT_IDS = ['4506648709627904']

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    })
  }
  if (!req.headers.has('Origin')) {
    return new Response(null, { status: 400 })
  }
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 })
  }

  try {
    const envelope = await req.text()
    const piece = envelope.split('\n')[0]
    const header = JSON.parse(piece)
    const dsn = new URL(header.dsn)
    const project_id = dsn.pathname?.replace('/', '')

    if (dsn.hostname !== SENTRY_HOST) {
      throw new Error(`Invalid sentry hostname: ${dsn.hostname}`)
    }

    if (!project_id || !SENTRY_PROJECT_IDS.includes(project_id)) {
      throw new Error(`Invalid sentry project id: ${project_id}`)
    }

    const upstream_sentry_url = `https://${SENTRY_HOST}/api/${project_id}/envelope/`
    await fetch(upstream_sentry_url, { method: 'POST', body: envelope })

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error('error tunneling to sentry', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
