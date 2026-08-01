const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export const assertSafeTestDatabaseUrl = (value: string | undefined): void => {
  let url: URL
  try {
    url = new URL(value ?? '')
  } catch {
    throw new Error('Tests require a valid PostgreSQL DATABASE_URL')
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.pathname !== '/dxrating_test'
  ) {
    throw new Error('Refusing to run tests outside the loopback dxrating_test database')
  }
}