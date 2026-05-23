export const parseCookieHeader = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>()
  if (!cookieHeader) return cookies

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (!rawName || rawValue.length === 0) continue

    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join('=')))
    } catch {
      cookies.set(rawName, rawValue.join('='))
    }
  }

  return cookies
}