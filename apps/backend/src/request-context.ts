import type { EvlogVariables } from 'evlog/hono'

/** Request-local values that must remain available when generic logging is skipped. */
export type AppEnvironment = {
  Variables: EvlogVariables['Variables'] & {
    requestId: string
  }
}