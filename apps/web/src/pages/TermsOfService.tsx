import { LegalLayout } from './LegalLayout'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const

const HEADINGS = {
  1: m.auth_terms_heading1,
  2: m.auth_terms_heading2,
  3: m.auth_terms_heading3,
  4: m.auth_terms_heading4,
  5: m.auth_terms_heading5,
  6: m.auth_terms_heading6,
  7: m.auth_terms_heading7,
} satisfies Record<(typeof SECTIONS)[number], PlainMessage>

const PARAGRAPHS = {
  1: m.auth_terms_p1,
  2: m.auth_terms_p2,
  3: m.auth_terms_p3,
  4: m.auth_terms_p4,
  5: m.auth_terms_p5,
  6: m.auth_terms_p6,
  7: m.auth_terms_p7,
} satisfies Record<(typeof SECTIONS)[number], PlainMessage>

export const TermsOfService = () => {
  const locale = useLocale()
  return (
    <LegalLayout
      title={m.auth_terms_title({}, { locale })}
      updated={m.auth_terms_updated({}, { locale })}
      current="terms"
      sections={SECTIONS.map((section) => ({
        id: `terms-section-${section}`,
        title: HEADINGS[section]({}, { locale }),
      }))}
    >
      {SECTIONS.map((section) => (
        <section key={section} aria-labelledby={`terms-section-${section}`}>
          <h2 id={`terms-section-${section}`}>{HEADINGS[section]({}, { locale })}</h2>
          <p>{PARAGRAPHS[section]({}, { locale })}</p>
        </section>
      ))}
    </LegalLayout>
  )
}