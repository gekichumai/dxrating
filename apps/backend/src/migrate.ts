import { fileURLToPath } from 'node:url'
import { loadBackendMigrationConfig } from './db/migration-config.js'
import { LegacyMigrationReconciliationRequiredError } from './db/migration-ledger.js'
import { runBackendMigrations } from './db/migration-runner.js'

const cliArguments = process.argv.slice(2)
const allowLegacyReconciliation = cliArguments.length === 1 && cliArguments[0] === '--reconcile-legacy'
if (cliArguments.length && !allowLegacyReconciliation) {
  console.error('Usage: migrate [--reconcile-legacy]')
  process.exitCode = 1
}

const interruption = new AbortController()
let receivedSignal: NodeJS.Signals | undefined

const handleSignal = (signal: NodeJS.Signals) => {
  receivedSignal = signal
  interruption.abort()
}

const handleSigint = () => handleSignal('SIGINT')
const handleSigterm = () => handleSignal('SIGTERM')

process.once('SIGINT', handleSigint)
process.once('SIGTERM', handleSigterm)

try {
  if (process.exitCode) throw new Error('InvalidMigrationArguments')
  await runBackendMigrations(
    loadBackendMigrationConfig({
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
      nonTransactionalMigrationsFolder: fileURLToPath(new URL('../non-transactional-migrations', import.meta.url)),
    }),
    { signal: interruption.signal, allowLegacyReconciliation },
  )
  if (receivedSignal) process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143
} catch (error) {
  if (receivedSignal || (error instanceof DOMException && error.name === 'AbortError')) {
    console.error('Backend migration job interrupted; it is safe to retry')
    process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143
  } else {
    const failureType = error instanceof Error ? error.name : 'UnknownMigrationError'
    console.error(
      JSON.stringify({
        scope: 'backend_migration',
        kind: 'failed',
        failureType,
        ...(error instanceof LegacyMigrationReconciliationRequiredError ? { migrationIds: error.migrationIds } : {}),
      }),
    )
    process.exitCode = 1
  }
} finally {
  process.removeListener('SIGINT', handleSigint)
  process.removeListener('SIGTERM', handleSigterm)
}