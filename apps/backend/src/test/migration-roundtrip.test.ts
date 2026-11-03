import { describe, expect, it } from 'vitest'
import { reversibleMigrations, runMigrationRoundTrip } from './migration-roundtrip'

describe('migration round trip', () => {
  it('ships a down.sql with every migration since the feature flags', () => {
    expect(reversibleMigrations()).toContain('20261103124449_feature_flags')
  })

  it('reverts every down.sql to the earlier schema and migrates back to the same schema', async () => {
    const report = await runMigrationRoundTrip(process.env.DATABASE_URL!)
    expect(report.reverted.at(-1)).toBe('20261103124449_feature_flags')
  }, 120_000)
})