const MARKDOWN_MIME_TYPE = 'text/markdown'
const HTML_ACCEPT_HEADER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

export function acceptsMarkdown(request: Request) {
  return (
    request.headers
      .get('Accept')
      ?.split(',')
      .some((value) => value.trim().toLowerCase().split(';')[0] === MARKDOWN_MIME_TYPE)
    ?? false
  )
}

export function normalizeMarkdownAcceptForHtmlRender(request: Request) {
  if (!acceptsMarkdown(request)) return request
  if (request.method !== 'GET' && request.method !== 'HEAD') return request

  try {
    request.headers.set('Accept', HTML_ACCEPT_HEADER)
    return request
  } catch {
    const headers = new Headers(request.headers)
    headers.set('Accept', HTML_ACCEPT_HEADER)

    return new Request(request, { headers })
  }
}
