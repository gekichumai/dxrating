/**
 * CI check: up -> every down.sql in reverse -> up, on throwaway databases
 * created next to the loopback dxrating_test database.
 *
 * Usage: DATABASE_URL=postgres://...@localhost:5432/dxrating_test pnpm --filter @gekichumai/backend test:migration-roundtrip
 */
import { runMigrationRoundTrip } from '../src/test/migration-roundtrip'

const report = await runMigrationRoundTrip(process.env.DATABASE_URL ?? '')
console.log(`Migration round trip passed; reverted ${report.reverted.join(', ')}`)