import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export const useControllerRulePresets = () => {
  const { t } = useTranslation(['form'])
  return useMemo(() => {
    return {
      min: (fieldName: string, value: number) =>
        ({
          value,
          message: t('form:validation.min.message', { fieldName, value }),
        }) as const,
      max: (fieldName: string, value: number) =>
        ({
          value,
          message: t('form:validation.max.message', { fieldName, value }),
        }) as const,
    }
  }, [t])
}
