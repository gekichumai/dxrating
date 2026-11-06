import { useTranslation } from 'react-i18next'
import { LegalLayout } from './LegalLayout'

// Section keys in reading order; each is the h2's id (`privacy-<key>`) and an entry in the desktop contents sidebar
const SECTIONS = [
  'intro',
  'collect',
  'use',
  'storage',
  'cloud',
  'analytics',
  'mcp',
  'cookies',
  'retention',
  'deletion',
  'rights',
  'changes',
] as const

export const PrivacyPolicy = () => {
  const { t } = useTranslation('auth')
  return (
    <LegalLayout
      title={t('privacy.title')}
      updated={t('privacy.updated')}
      current="privacy"
      sections={SECTIONS.map((key) => ({ id: `privacy-${key}`, title: t(`privacy.${key}.heading`) }))}
    >
      <h2 id="privacy-intro">{t('privacy.intro.heading')}</h2>
      <p>{t('privacy.intro.body')}</p>

      <h2 id="privacy-collect">{t('privacy.collect.heading')}</h2>
      <p>{t('privacy.collect.body')}</p>
      <ul>
        <li>
          <strong>{t('privacy.collect.direct.label')}</strong> {t('privacy.collect.direct.body')}
        </li>
        <li>
          <strong>{t('privacy.collect.usage.label')}</strong> {t('privacy.collect.usage.body')}
          <ul>
            {[1, 2, 3, 4, 5].map((item) => (
              <li key={item}>{t(`privacy.collect.usage.item${item}`)}</li>
            ))}
          </ul>
        </li>
      </ul>

      <h2 id="privacy-use">{t('privacy.use.heading')}</h2>
      <p>{t('privacy.use.body')}</p>
      <ul>
        {[1, 2, 3, 4, 5].map((item) => (
          <li key={item}>{t(`privacy.use.item${item}`)}</li>
        ))}
      </ul>

      <h2 id="privacy-storage">{t('privacy.storage.heading')}</h2>
      <p>{t('privacy.storage.body')}</p>

      <h2 id="privacy-cloud">{t('privacy.cloud.heading')}</h2>
      <p>{t('privacy.cloud.p1')}</p>
      <p>{t('privacy.cloud.p2')}</p>
      <p>{t('privacy.cloud.p3')}</p>

      <h2 id="privacy-analytics">{t('privacy.analytics.heading')}</h2>
      <p>{t('privacy.analytics.body')}</p>

      <h2 id="privacy-mcp">{t('privacy.mcp.heading')}</h2>
      <p>{t('privacy.mcp.body')}</p>

      <h2 id="privacy-cookies">{t('privacy.cookies.heading')}</h2>
      <p>{t('privacy.cookies.body')}</p>

      <h2 id="privacy-retention">{t('privacy.retention.heading')}</h2>
      <p>{t('privacy.retention.body')}</p>

      <h2 id="privacy-deletion">{t('privacy.deletion.heading')}</h2>
      <p>{t('privacy.deletion.p1')}</p>
      <p>{t('privacy.deletion.p2')}</p>

      <h2 id="privacy-rights">{t('privacy.rights.heading')}</h2>
      <p>{t('privacy.rights.body')}</p>
      <ul>
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <li key={item}>{t(`privacy.rights.item${item}`)}</li>
        ))}
      </ul>

      <h2 id="privacy-changes">{t('privacy.changes.heading')}</h2>
      <p>{t('privacy.changes.body')}</p>
    </LegalLayout>
  )
}