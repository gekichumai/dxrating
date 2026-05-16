import { createFileRoute } from '@tanstack/react-router'

const BASE_URL = 'https://dxrating.net'
const ICON_URL = 'https://shama.dxrating.net/favicon/pack/v1/favicon.ico'

export function buildOpenSearchDescription() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>DXRating</ShortName>
  <LongName>DXRating Song Search</LongName>
  <Description>Search maimai DX songs and charts on DXRating.</Description>
  <Tags>maimai maimaiDX DXRating songs charts rating</Tags>
  <Image height="16" width="16" type="image/x-icon">${ICON_URL}</Image>
  <Url type="text/html" method="get" template="${BASE_URL}/search?q={searchTerms}" />
  <Url type="application/opensearchdescription+xml" rel="self" template="${BASE_URL}/opensearch.xml" />
  <InputEncoding>UTF-8</InputEncoding>
  <Language>*</Language>
</OpenSearchDescription>`
}

export const Route = createFileRoute('/opensearch.xml')({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildOpenSearchDescription(), {
          headers: {
            'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        }),
    },
  },
})