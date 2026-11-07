import type { PlainMessage } from '@/i18n/message'
import type { ImportEntrySource } from '@/models/scores/ScoreRepository'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'

const SOURCE_LABELS = {
  'maimai-net': m.ratingCalculator_io_import_review_source_maimaiNet,
  lxns: m.ratingCalculator_io_import_review_source_lxns,
  'diving-fish': m.ratingCalculator_io_import_review_source_divingFish,
  'aqua-dx': m.ratingCalculator_io_import_review_source_aquaDx,
  'mu-net': m.ratingCalculator_io_import_review_source_muNet,
  'aqua-sqlite': m.ratingCalculator_io_import_review_source_aquaSqlite,
  'dxrating-json': m.ratingCalculator_io_import_review_source_dxratingJson,
} satisfies Record<ImportEntrySource, PlainMessage>

/** The short name of an import source, as the review dialog and the undo banner show it */
export const importSourceLabel = (locale: SupportedLocale, source: ImportEntrySource): string =>
  source in SOURCE_LABELS ? SOURCE_LABELS[source]({}, { locale }) : source