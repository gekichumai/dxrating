import { LegalLayout } from './LegalLayout'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

// Section keys in reading order; each is the h2's id (`privacy-<key>`) and an entry in the desktop contents sidebar
const SECTIONS = [
  'intro',
  'collect',
  'use',
  'storage',
  'analytics',
  'mcp',
  'cookies',
  'retention',
  'deletion',
  'rights',
  'changes',
] as const

const SECTION_HEADINGS = {
  intro: m.auth_privacy_intro_heading,
  collect: m.auth_privacy_collect_heading,
  use: m.auth_privacy_use_heading,
  storage: m.auth_privacy_storage_heading,
  analytics: m.auth_privacy_analytics_heading,
  mcp: m.auth_privacy_mcp_heading,
  cookies: m.auth_privacy_cookies_heading,
  retention: m.auth_privacy_retention_heading,
  deletion: m.auth_privacy_deletion_heading,
  rights: m.auth_privacy_rights_heading,
  changes: m.auth_privacy_changes_heading,
} satisfies Record<(typeof SECTIONS)[number], PlainMessage>

const USAGE_ITEMS: PlainMessage[] = [
  m.auth_privacy_collect_usage_item1,
  m.auth_privacy_collect_usage_item2,
  m.auth_privacy_collect_usage_item3,
  m.auth_privacy_collect_usage_item4,
  m.auth_privacy_collect_usage_item5,
]

const USE_ITEMS: PlainMessage[] = [
  m.auth_privacy_use_item1,
  m.auth_privacy_use_item2,
  m.auth_privacy_use_item3,
  m.auth_privacy_use_item4,
  m.auth_privacy_use_item5,
]

const RIGHTS_ITEMS: PlainMessage[] = [
  m.auth_privacy_rights_item1,
  m.auth_privacy_rights_item2,
  m.auth_privacy_rights_item3,
  m.auth_privacy_rights_item4,
  m.auth_privacy_rights_item5,
  m.auth_privacy_rights_item6,
]

export const PrivacyPolicy = () => {
  const locale = useLocale()
  return (
    <LegalLayout
      title={m.auth_privacy_title({}, { locale })}
      updated={m.auth_privacy_updated({}, { locale })}
      current="privacy"
      sections={SECTIONS.map((key) => ({ id: `privacy-${key}`, title: SECTION_HEADINGS[key]({}, { locale }) }))}
    >
      <h2 id="privacy-intro">{m.auth_privacy_intro_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_intro_body({}, { locale })}</p>

      <h2 id="privacy-collect">{m.auth_privacy_collect_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_collect_body({}, { locale })}</p>
      <ul>
        <li>
          <strong>{m.auth_privacy_collect_direct_label({}, { locale })}</strong>{' '}
          {m.auth_privacy_collect_direct_body({}, { locale })}
        </li>
        <li>
          <strong>{m.auth_privacy_collect_usage_label({}, { locale })}</strong>{' '}
          {m.auth_privacy_collect_usage_body({}, { locale })}
          <ul>
            {USAGE_ITEMS.map((item, index) => (
              <li key={index}>{item({}, { locale })}</li>
            ))}
          </ul>
        </li>
      </ul>

      <h2 id="privacy-use">{m.auth_privacy_use_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_use_body({}, { locale })}</p>
      <ul>
        {USE_ITEMS.map((item, index) => (
          <li key={index}>{item({}, { locale })}</li>
        ))}
      </ul>

      <h2 id="privacy-storage">{m.auth_privacy_storage_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_storage_body({}, { locale })}</p>

      <h2 id="privacy-analytics">{m.auth_privacy_analytics_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_analytics_body({}, { locale })}</p>

      <h2 id="privacy-mcp">{m.auth_privacy_mcp_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_mcp_body({}, { locale })}</p>

      <h2 id="privacy-cookies">{m.auth_privacy_cookies_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_cookies_body({}, { locale })}</p>

      <h2 id="privacy-retention">{m.auth_privacy_retention_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_retention_body({}, { locale })}</p>

      <h2 id="privacy-deletion">{m.auth_privacy_deletion_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_deletion_p1({}, { locale })}</p>
      <p>{m.auth_privacy_deletion_p2({}, { locale })}</p>

      <h2 id="privacy-rights">{m.auth_privacy_rights_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_rights_body({}, { locale })}</p>
      <ul>
        {RIGHTS_ITEMS.map((item, index) => (
          <li key={index}>{item({}, { locale })}</li>
        ))}
      </ul>

      <h2 id="privacy-changes">{m.auth_privacy_changes_heading({}, { locale })}</h2>
      <p>{m.auth_privacy_changes_body({}, { locale })}</p>
    </LegalLayout>
  )
}