import { lockNewMigrations } from '../src/test/migration-lock'

const locked = lockNewMigrations()
console.log(locked.length > 0 ? `Locked ${locked.join(', ')}` : 'Every migration is already locked')