/**
 * Maps an i18next key (`namespace:key`, with `keySeparator: false`) to its Paraglide message id: `:` and `.` become
 * `_`, `-` camel-cases the next character, and any other character that is not a letter, digit or `_` is dropped.
 * `rating-calculator:io.import.lxns.success-title` → `ratingCalculator_io_import_lxns_successTitle`. The conversion
 * script fails if two keys map to the same id.
 */
export function toMessageId(namespace: string, key: string): string {
  return `${namespace}:${key}`
    .replace(/-+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/[:.]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
}

export const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const