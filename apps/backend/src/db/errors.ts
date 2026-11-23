import { Data } from 'effect'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}