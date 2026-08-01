import { describe, expect, it } from 'vitest'
import { assertSafeTestDatabaseUrl } from './test-database-safety.js'

describe('test database safety', () => {
  it.each([
    'postgres://postgres:postgres@localhost:5432/dxrating_test',
    'postgresql://postgres:postgres@127.0.0.1:32771/dxrating_test',
    'postgres://postgres:postgres@[::1]:5432/dxrating_test',
  ])('accepts the isolated test database on loopback: %s', (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).not.toThrow()
  })

  it.each([
    undefined,
    'not a URL',
    'postgres://postgres:postgres@db.internal:5432/dxrating_test',
    'postgres://postgres:postgres@localhost:5432/dxrating',
    'https://localhost/dxrating_test',
  ])('rejects a potentially destructive target: %s', (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow()
  })
})