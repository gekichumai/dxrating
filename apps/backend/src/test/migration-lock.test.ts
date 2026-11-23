import { describe, expect, it } from 'vitest'
import { checkMigrationLock } from './migration-lock'

describe('drizzle/migrations.lock.json', () => {
  it('matches every applied migration byte for byte', () => {
    expect(checkMigrationLock().violations).toEqual([])
  })

  it('records every migration', () => {
    expect(
      checkMigrationLock().unlocked,
      'Once a new migration is final, record it with pnpm --filter @gekichumai/backend migrations:lock',
    ).toEqual([])
  })
})