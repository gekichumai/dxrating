import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

function isLocalizedMessage(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}

function isLanguageList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((language) => typeof language === 'string')
}

export const useLocalizedMessageTranslation = () => {
  const { i18n } = useTranslation()
  return useCallback(
    (message: unknown): string | null => {
      if (typeof message === 'string') return message === '' ? null : message
      if (!isLocalizedMessage(message)) return null
      const translated = message[i18n.language]
      if (translated !== undefined && translated !== '') return translated

      const configuredFallback = i18n.options.fallbackLng
      const fallback = typeof configuredFallback === 'function' ? configuredFallback(i18n.language) : configuredFallback
      const configuredLanguages =
        typeof fallback === 'string'
          ? [fallback]
          : isLanguageList(fallback)
            ? fallback
            : typeof fallback === 'object'
              ? (Object.entries(fallback).find(([language]) => language === i18n.language)?.[1] ??
                Object.entries(fallback).find(([language]) => language === 'default')?.[1])
              : []
      const fallbacks = isLanguageList(configuredLanguages) ? configuredLanguages : []
      for (const language of fallbacks) {
        const value = message[language]
        if (value !== undefined && value !== '') return value
      }
      return Object.values(message)[0] ?? null
    },
    [i18n.language, i18n.options.fallbackLng],
  )
}