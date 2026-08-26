import type { Pool, PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { acquireIdentityWriteLeasePermit } from '../identity-write-lease-permit.js'
import { runRetryableAdminTransaction } from './retryable-transaction.js'

describe('retryable administrator transaction capacity', () => {
  it('waits for the shared identity-operation permit before obtaining a pool client', async () => {
    const query = vi.fn(async (_statement: string) => undefined)
    const release = vi.fn()
    const transaction = { query, release } as unknown as PoolClient
    const connect = vi.fn(async () => transaction)
    const database = {
      options: { max: 2 },
      connect,
    } as unknown as Pool

    const releaseOuterLease = await acquireIdentityWriteLeasePermit(database)
    const operation = vi.fn(async () => 'completed')
    const moderation = runRetryableAdminTransaction(database, operation)

    // max=2 admits one identity operation. A moderation request queued behind
    // that outer lease must not reserve the second connection while it waits.
    expect(connect).not.toHaveBeenCalled()

    releaseOuterLease()
    await expect(moderation).resolves.toBe('completed')
    expect(connect).toHaveBeenCalledOnce()
    expect(operation).toHaveBeenCalledWith(transaction)
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'COMMIT'])
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases the shared permit after a terminal transaction failure', async () => {
    const failure = new Error('terminal transaction failure')
    const transaction = {
      query: vi.fn(async () => undefined),
      release: vi.fn(),
    } as unknown as PoolClient
    const database = {
      options: { max: 2 },
      connect: vi.fn(async () => transaction),
    } as unknown as Pool

    await expect(
      runRetryableAdminTransaction(database, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)

    const releaseNextLease = await acquireIdentityWriteLeasePermit(database)
    releaseNextLease()
  })
})