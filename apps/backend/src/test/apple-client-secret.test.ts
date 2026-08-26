import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAppleClientSecretGenerator } from '../lib/apple-client-secret.js'

const decodePart = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

describe('Apple client secret generation', () => {
  it('derives a fresh, short-lived ES256 JWT from the stored private key', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T00:00:00Z'))
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    })
    const privateKeyPEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const generate = createAppleClientSecretGenerator({
      clientId: 'net.dxrating.ios',
      teamId: 'F25GFFJL49',
      keyId: '4L73JRJD56',
      privateKeyBase64: Buffer.from(privateKeyPEM).toString('base64'),
    })

    const token = generate()
    const [headerPart, payloadPart, signaturePart] = token.split('.')
    const header = decodePart(headerPart!)
    const payload = decodePart(payloadPart!)

    expect(header).toEqual({ alg: 'ES256', kid: '4L73JRJD56' })
    expect(payload).toMatchObject({
      iss: 'F25GFFJL49',
      iat: 1_787_788_800,
      exp: 1_787_789_400,
      aud: 'https://appleid.apple.com',
      sub: 'net.dxrating.ios',
    })
    expect(
      verify(
        'sha256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363',
        },
        Buffer.from(signaturePart!, 'base64url'),
      ),
    ).toBe(true)
    vi.useRealTimers()
  })
})