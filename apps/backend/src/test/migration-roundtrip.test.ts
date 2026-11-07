import { describe, expect, it } from 'vitest'
import { reversibleMigrations, runMigrationRoundTrip } from './migration-roundtrip'

describe('migration round trip', () => {
  it('ships a down.sql with every migration since the feature flags, newest first', () => {
    expect(reversibleMigrations()).toEqual(['20261107203237_cloud_save', '20261107203208_feature_flags'])
  })

  it('reverts every down.sql to the earlier schema and migrates back to the same schema', async () => {
    const report = await runMigrationRoundTrip(process.env.DATABASE_URL!)
    expect(report.reverted).toEqual(['20261107203237_cloud_save', '20261107203208_feature_flags'])
  }, 120_000)
})
