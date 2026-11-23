import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const migrationsFolder = path.resolve(import.meta.dirname, '../../drizzle')
const lockPath = path.join(migrationsFolder, 'migrations.lock.json')
const immutable = 'Applied migrations are immutable: restore it and add a new migration with drizzle-kit generate.'

const read = () => ({
  lock: JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, string>,
  files: new Map(readMigrationFiles({ migrationsFolder }).map((migration) => [migration.name, migration.hash])),
})

/**
 * Compares every migration folder with drizzle/migrations.lock.json, the sha256 that Drizzle's ledger
 * stores for each applied migration. Drizzle skips any migration whose name is already in the ledger,
 * so an edited migration.sql runs on new databases and never on the ones that applied the old SQL.
 */
export const checkMigrationLock = ({ lock, files } = read()) => {
  const lastLocked = Object.keys(lock).sort().at(-1) ?? ''
  const violations: string[] = []
  for (const [name, hash] of Object.entries(lock)) {
    if (!files.has(name)) violations.push(`${name} was applied and is gone. ${immutable}`)
    else if (files.get(name) !== hash)
      violations.push(`${name}/migration.sql changed after it was applied. ${immutable}`)
  }
  const unlocked = [...files.keys()].filter((name) => !(name in lock))
  for (const name of unlocked) {
    if (name < lastLocked) {
      violations.push(`${name} sorts before the applied ${lastLocked}. Delete it and run drizzle-kit generate again.`)
    }
  }
  return { violations, unlocked }
}

export const lockNewMigrations = () => {
  const state = read()
  const { violations, unlocked } = checkMigrationLock(state)
  if (violations.length > 0) throw new Error(violations.join('\n'))
  for (const name of unlocked) state.lock[name] = state.files.get(name)!
  writeFileSync(lockPath, `${JSON.stringify(state.lock, null, 2)}\n`)
  return unlocked
}