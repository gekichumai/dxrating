import { createPrivateKey, sign } from 'node:crypto'

const APPLE_AUDIENCE = 'https://appleid.apple.com'
const CLIENT_SECRET_LIFETIME_SECONDS = 10 * 60

export type AppleClientSecretConfig = {
  clientId: string
  keyId: string
  teamId: string
  privateKeyBase64: string
}

const encodeJSON = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

export const createAppleClientSecretGenerator = (config: AppleClientSecretConfig) => {
  const privateKeyPEM = Buffer.from(config.privateKeyBase64, 'base64').toString('utf8')
  const privateKey = createPrivateKey(privateKeyPEM)

  return () => {
    const issuedAt = Math.floor(Date.now() / 1_000)
    const header = encodeJSON({ alg: 'ES256', kid: config.keyId })
    const payload = encodeJSON({
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + CLIENT_SECRET_LIFETIME_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    })
    const signingInput = `${header}.${payload}`
    const signature = sign('sha256', Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')

    return `${signingInput}.${signature}`
  }
}