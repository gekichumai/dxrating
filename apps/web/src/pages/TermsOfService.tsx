import { useTranslation } from 'react-i18next'
import { LegalLayout } from './LegalLayout'

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const

export const TermsOfService = () => {
  const { t } = useTranslation('auth')
  return (
    <LegalLayout
      title={t('terms.title')}
      updated={t('terms.updated')}
      current="terms"
      sections={SECTIONS.map((section) => ({ id: `terms-section-${section}`, title: t(`terms.heading${section}`) }))}
    >
      {SECTIONS.map((section) => (
        <section key={section} aria-labelledby={`terms-section-${section}`}>
          <h2 id={`terms-section-${section}`}>{t(`terms.heading${section}`)}</h2>
          <p>{t(`terms.p${section}`)}</p>
        </section>
      ))}
    </LegalLayout>
  )
}