import { useMemo } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const useControllerRulePresets = () => {
  const locale = useLocale()
  return useMemo(() => {
    return {
      min: (_fieldName: string, value: number) =>
        ({
          value,
          message: m.form_validation_min_message({ value }, { locale }),
        }) as const,
      max: (_fieldName: string, value: number) =>
        ({
          value,
          message: m.form_validation_max_message({ value }, { locale }),
        }) as const,
    }
  }, [locale])
}