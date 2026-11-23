import { z } from 'zod'
import { persisted } from '@/utils/persisted'

/** The SEGA ID the visitor chose to remember for maimai NET imports */
export const netCredentials = persisted(
  'import-net-records',
  z.object({ region: z.enum(['jp', 'intl']).catch('intl'), username: z.string(), password: z.string() }),
  null,
)

/** `true` is what older builds stored for `'replace'` */
export const netAutoImport = persisted(
  'rating-auto-import-from-net',
  z.union([z.boolean(), z.enum(['replace', 'merge'])]),
  false,
)

/** When the last maimai NET import succeeded, in epoch milliseconds */
export const netImportLastSuccess = persisted('net-import-last-success', z.number(), null)