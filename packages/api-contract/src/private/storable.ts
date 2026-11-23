import { z } from 'zod'

/**
 * The primitives the private contract builds its schemas from. PostgreSQL rejects U+0000 and unpaired UTF-16
 * surrogates in text and JSONB, integers beyond a column's range and timestamps outside years 1 to 9999. A value it
 * rejects fails the whole statement with a 500 and rolls back the valid rest of the write, so each primitive refuses
 * such values as a validation error instead.
 */

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
export const isStorableText = (value: string) => !value.includes('\u0000') && !LONE_SURROGATE.test(value)

/** A string PostgreSQL `text` and JSONB can hold */
export const PgText = z.string().refine(isStorableText, 'must be well-formed Unicode without U+0000')

/** An integer that fits a PostgreSQL `integer` column */
export const PgInteger = z.int32()

/** An integer that fits a PostgreSQL `bigint` column and stays exact in JavaScript */
export const PgBigint = z.int()

/** An ISO 8601 timestamp with an offset whose UTC year is 1 to 9999, as `timestamptz` stores it */
export const PgTimestamp = z.iso.datetime({ offset: true }).refine((value) => {
  const year = new Date(value).getUTCFullYear()
  return year >= 1 && year <= 9999
}, 'Out of the storable range')

/** `schema`, read from a query string */
export const fromQuery = <T extends z.ZodType<number, number>>(schema: T) => z.coerce.number().pipe(schema)