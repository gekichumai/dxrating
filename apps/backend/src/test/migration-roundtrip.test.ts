import { describe, expect, it } from 'vitest'
import { reversibleMigrations, runMigrationRoundTrip } from './migration-roundtrip'

const REVERSIBLE = [
  '20261123134726_backfill_email_verified_at',
  '20261123134711_email_verified_at',
  '20261107203237_cloud_save',
  '20261107203208_feature_flags',
]

describe('migration round trip', () => {
  it('ships a down.sql with every migration since the feature flags, newest first', () => {
    expect(reversibleMigrations()).toEqual(REVERSIBLE)
  })

  it('reverts every down.sql to the earlier schema and migrates back to the same schema', async () => {
    const report = await runMigrationRoundTrip(process.env.DATABASE_URL!)
    expect(report.reverted).toEqual(REVERSIBLE)
  }, 120_000)
})