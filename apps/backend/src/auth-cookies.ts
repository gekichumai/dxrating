export type CrossSubDomainCookieOptions = {
  enabled: true
  domain: string
}

type ResolveCrossSubDomainCookieOptionsInput = {
  configuredDomain?: string | undefined
  authURL?: string | undefined
  frontendURL?: string | undefined
}

const normalizeCookieDomain = (domain: string | undefined) => {
  const normalizedDomain = domain?.trim()
  return normalizedDomain || undefined
}

const deriveParentDomainFromHosts = (authURL: string | undefined, frontendURL: string | undefined) => {
  if (!authURL || !frontendURL) {
    return undefined
  }

  try {
    const authHost = new URL(authURL).hostname
    const frontendHost = new URL(frontendURL).hostname

    if (authHost === frontendHost || !authHost.endsWith(`.${frontendHost}`)) {
      return undefined
    }

    return frontendHost
  } catch {
    return undefined
  }
}

export const resolveCrossSubDomainCookieOptions = ({
  configuredDomain,
  authURL,
  frontendURL,
}: ResolveCrossSubDomainCookieOptionsInput): CrossSubDomainCookieOptions | undefined => {
  const domain = normalizeCookieDomain(configuredDomain) ?? deriveParentDomainFromHosts(authURL, frontendURL)

  if (!domain) {
    return undefined
  }

  return {
    enabled: true,
    domain,
  }
}