import { useCallback } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'
import { DEFAULT_LOCALE } from '@/setup/locale'

// isAssumedRecord omits deep checks of the object's values but rather
// only checks if the value is an object and not null.
// it is not really a type guard but rather a type assumption.
function isAssumedRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null
}

export const useLocalizedMessageTranslation = () => {
  const locale = useLocale()

  return useCallback(
    (message?: Record<string, string> | any | null): string | null => {
      if (!message) return null
      if (typeof message === 'string') return message
      if (!isAssumedRecord(message)) return null

      if (message[locale]) return message[locale] ?? null

      if (message[DEFAULT_LOCALE]) return message[DEFAULT_LOCALE] ?? null

      if (Object.keys(message).length === 0) return null

      return message[Object.keys(message)[0]] ?? null
    },
    [locale],
  )
}