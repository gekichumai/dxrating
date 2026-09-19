import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './legal.css'

export function LegalLayout({
  title,
  updated,
  current,
  children,
}: {
  title: string
  updated: string
  current: 'terms' | 'privacy'
  children: ReactNode
}) {
  const { t } = useTranslation('auth')
  return (
    <div className="legal-page">
      <main className="legal-document">
        <button
          className="legal-back"
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back()
            else window.location.assign('/')
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m12 5-7 7 7 7M5 12h14" />
          </svg>
          {t('legal.back')}
        </button>
        <header className="legal-title">
          <h1>{title}</h1>
          <p>{updated}</p>
        </header>
        <article className="legal-prose">{children}</article>
        <footer className="legal-footer">
          <a href={current === 'terms' ? '/privacy-policy' : '/terms-of-service'}>
            {t(current === 'terms' ? 'terms.privacy' : 'terms.title')}
          </a>
          <a href="https://discord.gg/8CFgUPxyrU">{t('terms.support')}</a>
        </footer>
      </main>
    </div>
  )
}