import type { Pool } from 'pg'

type IdentityMutationPermitGate = {
  readonly limit: number
  active: number
  readonly waiters: Array<() => void>
}

// Public leases, administrator leases, and exclusive moderation transactions
// share one FIFO gate for each physical pool. Separate gates could collectively
// consume every connection while an outer lease still needs a handler
// connection, and an ungated moderation transaction could consume that same
// reserved capacity while waiting for an outer lease's advisory lock.
const identityMutationPermitGates = new WeakMap<Pool, IdentityMutationPermitGate>()

export const getIdentityWriteLeaseConcurrencyLimit = (database: Pool): number =>
  Math.max(1, Math.floor((database.options.max ?? 10) / 2))

const acquireIdentityMutationPermit = async (database: Pool): Promise<() => void> => {
  let gate = identityMutationPermitGates.get(database)
  if (!gate) {
    gate = {
      limit: getIdentityWriteLeaseConcurrencyLimit(database),
      active: 0,
      waiters: [],
    }
    identityMutationPermitGates.set(database, gate)
  }

  if (gate.active >= gate.limit) {
    await new Promise<void>((resolve) => gate!.waiters.push(resolve))
  } else {
    gate.active += 1
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const next = gate!.waiters.shift()
    if (next) next()
    else gate!.active -= 1
  }
}

export const acquireIdentityWriteLeasePermit = acquireIdentityMutationPermit

/**
 * Reserves capacity before an exclusive identity transaction obtains a pool
 * client. The permit spans bounded retries so a transaction never waits for a
 * write lease while occupying the connections reserved for lease handlers.
 */
export const acquireIdentityModerationPermit = acquireIdentityMutationPermit