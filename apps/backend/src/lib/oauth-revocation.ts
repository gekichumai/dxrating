type OAuthAccount = {
  providerId: string
  accessToken: string | null
  refreshToken: string | null
}

type OAuthRevocationConfiguration = {
  apple?: {
    clientId: string
    clientSecret: () => string
  }
  github?: {
    clientId: string
    clientSecret: string
  }
}

export type OAuthRevocationIssue = {
  providerId: string
  reason: 'missing-configuration' | 'missing-token' | 'request-failed'
  error?: string
}

type RevokeOAuthGrantsOptions = {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

const acceptedStatuses: Record<string, ReadonlySet<number>> = {
  apple: new Set([200]),
  google: new Set([200, 400]),
  github: new Set([204, 404]),
}

export async function revokeOAuthGrants(
  accounts: OAuthAccount[],
  configuration: OAuthRevocationConfiguration,
  options: RevokeOAuthGrantsOptions = {},
): Promise<OAuthRevocationIssue[]> {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 5_000

  const results = await Promise.all(
    accounts
      .filter((account) => Object.hasOwn(acceptedStatuses, account.providerId))
      .map(async (account): Promise<OAuthRevocationIssue | undefined> => {
        try {
          const request = createRevocationRequest(account, configuration)
          if ('issue' in request) return request.issue

          const response = await fetchImplementation(request.url, {
            ...request.init,
            signal: AbortSignal.timeout(timeoutMs),
          })
          if (!acceptedStatuses[account.providerId]!.has(response.status)) {
            return {
              providerId: account.providerId,
              reason: 'request-failed',
              error: `Unexpected HTTP status ${response.status}`,
            }
          }
        } catch (error) {
          return {
            providerId: account.providerId,
            reason: 'request-failed',
            error: error instanceof Error ? error.message : 'Unknown revocation error',
          }
        }
      }),
  )

  return results.filter((issue): issue is OAuthRevocationIssue => issue !== undefined)
}

function createRevocationRequest(
  account: OAuthAccount,
  configuration: OAuthRevocationConfiguration,
): { url: string; init: RequestInit } | { issue: OAuthRevocationIssue } {
  switch (account.providerId) {
    case 'apple': {
      const provider = configuration.apple
      if (!provider) return issue(account.providerId, 'missing-configuration')

      const token = account.refreshToken ?? account.accessToken
      if (!token) return issue(account.providerId, 'missing-token')

      return {
        url: 'https://appleid.apple.com/auth/revoke',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: provider.clientId,
            client_secret: provider.clientSecret(),
            token,
            token_type_hint: account.refreshToken ? 'refresh_token' : 'access_token',
          }),
        },
      }
    }
    case 'google': {
      const token = account.refreshToken ?? account.accessToken
      if (!token) return issue(account.providerId, 'missing-token')

      return {
        url: 'https://oauth2.googleapis.com/revoke',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        },
      }
    }
    case 'github': {
      const provider = configuration.github
      if (!provider) return issue(account.providerId, 'missing-configuration')
      if (!account.accessToken) return issue(account.providerId, 'missing-token')

      return {
        url: `https://api.github.com/applications/${encodeURIComponent(provider.clientId)}/token`,
        init: {
          method: 'DELETE',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ access_token: account.accessToken }),
        },
      }
    }
    default:
      throw new Error(`Unsupported OAuth provider: ${account.providerId}`)
  }
}

function issue(providerId: string, reason: OAuthRevocationIssue['reason']): { issue: OAuthRevocationIssue } {
  return { issue: { providerId, reason } }
}