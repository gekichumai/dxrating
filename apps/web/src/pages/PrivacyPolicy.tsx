import { useTranslation } from 'react-i18next'
import { LegalLayout } from './LegalLayout'

export const PrivacyPolicy = () => {
  const { t } = useTranslation('auth')
  return (
    <LegalLayout title={t('privacy.title')} updated={t('privacy.updated')} current="privacy">
      <h2>{t('privacy.intro.heading')}</h2>
      <p>{t('privacy.intro.body')}</p>

      <h2>{t('privacy.collect.heading')}</h2>
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

      <h2>{t('privacy.use.heading')}</h2>
      <p>{t('privacy.use.body')}</p>
      <ul>
        {[1, 2, 3, 4, 5].map((item) => (
          <li key={item}>{t(`privacy.use.item${item}`)}</li>
        ))}
      </ul>

      <h2>{t('privacy.storage.heading')}</h2>
      <p>{t('privacy.storage.body')}</p>

      <h2>{t('privacy.analytics.heading')}</h2>
      <p>{t('privacy.analytics.body')}</p>

      <h2>{t('privacy.mcp.heading')}</h2>
      <p>{t('privacy.mcp.body')}</p>

      <h2>{t('privacy.cookies.heading')}</h2>
      <p>{t('privacy.cookies.body')}</p>

      <h2>{t('privacy.retention.heading')}</h2>
      <p>{t('privacy.retention.body')}</p>

      <h2>{t('privacy.deletion.heading')}</h2>
      <p>{t('privacy.deletion.p1')}</p>
      <p>{t('privacy.deletion.p2')}</p>

      <h2>{t('privacy.rights.heading')}</h2>
      <p>{t('privacy.rights.body')}</p>
      <ul>
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <li key={item}>{t(`privacy.rights.item${item}`)}</li>
        ))}
      </ul>

      <h2>{t('privacy.changes.heading')}</h2>
      <p>{t('privacy.changes.body')}</p>
    </LegalLayout>
  )
}