import { ORPCError } from '@orpc/server'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { withCatalogIdentityErrors } from '../router'
import { CatalogIdentityError } from './catalog-identities'

describe('catalog identity API errors', () => {
  it('preserves the identity and database cause chain when converting to ORPCError', async () => {
    const databaseError = new Error('database connection failed')
    const identityError = new CatalogIdentityError('unavailable', 'Published catalog identities are unavailable', {
      cause: databaseError,
    })

    const caught = await Effect.runPromise(Effect.flip(withCatalogIdentityErrors(Effect.fail(identityError))))

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