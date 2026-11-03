import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  API_DOCS_CSP,
  API_DOCS_HTML,
  API_JSON_CSP,
  SCALAR_SCRIPT_INTEGRITY,
  SCALAR_SCRIPT_URL,
  isJsonContentType,
} from './api-docs'

const sha256 = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`
const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? []

describe('API docs page', () => {
  it('allows its inline scripts by their hashes', () => {
    const inline = [...API_DOCS_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])

    expect(inline).toHaveLength(2)
    expect(directive(API_DOCS_CSP, 'script-src').toSorted()).toEqual(
      [SCALAR_SCRIPT_URL, ...inline.map(sha256)].toSorted(),
    )
    expect(API_DOCS_HTML).not.toMatch(/\son[a-z]+=/)
  })

  it('loads a pinned Scalar, checked by its integrity hash', () => {
    expect(SCALAR_SCRIPT_URL).toMatch(/@scalar\/api-reference@\d+\.\d+\.\d+\//)
    expect(API_DOCS_HTML).toContain(
      `<script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>`,
    )
    // The Zod config must run before the bundle, the call that starts Scalar after it.
    const order = ['jitless', SCALAR_SCRIPT_URL, 'createApiReference'].map((s) => API_DOCS_HTML.indexOf(s))
    expect(order).toEqual(order.toSorted((a, b) => a - b))
  })

  it('denies eval, framing, and everything not listed', () => {
    expect(API_DOCS_CSP).not.toContain("'unsafe-eval'")
    expect(directive(API_DOCS_CSP, 'script-src')).not.toContain("'unsafe-inline'")
    expect(directive(API_DOCS_CSP, 'default-src')).toEqual(["'none'"])
    expect(directive(API_DOCS_CSP, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(API_DOCS_CSP, 'base-uri')).toEqual(["'none'"])
    expect(directive(API_DOCS_CSP, 'connect-src')).toEqual(["'self'", 'https://api.scalar.com'])
  })
})

describe('API JSON responses', () => {
  it('get a policy that allows nothing', () => {
    expect(API_JSON_CSP).toBe("default-src 'none'; frame-ancestors 'none'")
  })

  it('are recognized by their media type', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('application/json; charset=UTF-8')).toBe(true)
    expect(isJsonContentType('application/linkset+json; profile="x"')).toBe(true)
    expect(isJsonContentType('text/html; charset=UTF-8')).toBe(false)
    expect(isJsonContentType('text/event-stream')).toBe(false)
    expect(isJsonContentType(null)).toBe(false)
  })
})