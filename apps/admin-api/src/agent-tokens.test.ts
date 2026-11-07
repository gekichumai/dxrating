import { describe, expect, it } from 'vitest'
import { AgentTokensSchema, findAgentToken, generateAgentToken, hashToken } from './agent-tokens'

const entry = (sha256: string, extra: Record<string, unknown> = {}) => ({
  principal: 'coordinator',
  sha256,
  scopes: ['announcements:read'],
  expiresAt: '2999-01-01T00:00:00Z',
  ...extra,
})

describe('agent tokens', () => {
  it('generates prefixed tokens and finds them by hash only', () => {
    const { token, sha256 } = generateAgentToken()
    expect(token.startsWith('dxa_')).toBe(true)
    const entries = AgentTokensSchema.parse(JSON.stringify([entry(sha256)]))
    expect(findAgentToken(entries, token)?.principal).toBe('coordinator')
    expect(findAgentToken(entries, `${token}x`)).toBeUndefined()
    expect(findAgentToken(entries, sha256)).toBeUndefined()
  })

  it('treats blank config as no tokens', () => {
    expect(AgentTokensSchema.parse('')).toEqual([])
    expect(AgentTokensSchema.parse(undefined)).toEqual([])
  })

  it.each([
    ['an unknown scope', [entry(hashToken('dxa_a'), { scopes: ['*'] })]],
    ['no scopes', [entry(hashToken('dxa_a'), { scopes: [] })]],
    ['a plaintext token instead of a hash', [entry('dxa_plaintext')]],
    ['a missing expiry', [{ ...entry(hashToken('dxa_a')), expiresAt: undefined }]],
    ['an unknown field', [entry(hashToken('dxa_a'), { token: 'dxa_a' })]],
    ['a duplicate hash', [entry(hashToken('dxa_a')), entry(hashToken('dxa_a'), { principal: 'other' })]],
  ])('rejects config with %s', (_, entries) => {
    expect(() => AgentTokensSchema.parse(JSON.stringify(entries))).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => AgentTokensSchema.parse('[{')).toThrow()
  })
})