const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://dxrating.net', 'capacitor://localhost']

export const cors = (req: Request) => {
  // cors
  const corsHeaders = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') ?? '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Authorization, Apikey, Content-Type, X-Client-Info',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
  if (!req.headers.has('Origin')) {
    throw new Response(null, { status: 400 })
  }
  if (!ALLOWED_ORIGINS.includes(req.headers.get('Origin')!)) {
    throw new Response(
      JSON.stringify({
        error: 'Origin is not allowed',
      }),
      { status: 403 },
    )
  }

  if (req.method === 'OPTIONS') {
    throw new Response(null, {
      headers: corsHeaders,
    })
  }

  return corsHeaders
}
