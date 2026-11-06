import type { TFunction } from 'i18next'
import type { ImportEntrySource } from '@/models/scores/ScoreRepository'

const SOURCE_KEYS = {
  'maimai-net': 'rating-calculator:io.import.review.source.maimai-net',
  lxns: 'rating-calculator:io.import.review.source.lxns',
  'diving-fish': 'rating-calculator:io.import.review.source.diving-fish',
  'aqua-dx': 'rating-calculator:io.import.review.source.aqua-dx',
  'mu-net': 'rating-calculator:io.import.review.source.mu-net',
  'aqua-sqlite': 'rating-calculator:io.import.review.source.aqua-sqlite',
  'dxrating-json': 'rating-calculator:io.import.review.source.dxrating-json',
} as const satisfies Record<ImportEntrySource, string>

/** The short name of an import source, as the review dialog and the undo banner show it */
export const importSourceLabel = (t: TFunction, source: ImportEntrySource): string =>
  source in SOURCE_KEYS ? t(SOURCE_KEYS[source]) : source