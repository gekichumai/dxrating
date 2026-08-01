import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { withCatalogIdentityErrors } from '../router.js'
import { CatalogIdentityError } from './catalog-identities.js'

describe('catalog identity API errors', () => {
  it('preserves the identity and database cause chain when converting to ORPCError', async () => {
    const databaseError = new Error('database connection failed')
    const identityError = new CatalogIdentityError('unavailable', 'Published catalog identities are unavailable', {
      cause: databaseError,
    })

    let caught: unknown
    try {
      await withCatalogIdentityErrors(() => Promise.reject(identityError))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ORPCError)
    expect(caught).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: identityError.message,
      cause: identityError,
    })
    expect((caught as Error).cause).toBe(identityError)
    expect(identityError.cause).toBe(databaseError)
  })
})