import type { SupportedLocale } from '@/setup/locale'

/** Options every component passes to a message: `m.key(inputs, { locale })`. */
export type MessageOptions = { locale?: SupportedLocale }

/**
 * A Paraglide message that takes no inputs, for data that names a label (`label: m.root_pages_search_title`) and
 * for explicit maps from a value to its message (`TAB_LABELS[kind]({}, { locale })`).
 */
export type PlainMessage = (inputs?: Record<string, never>, options?: MessageOptions) => string