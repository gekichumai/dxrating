import { useCanGoBack, useRouter } from '@tanstack/react-router'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { InternalLink } from '@/components/global/InternalLink'

export interface LegalSection {
  /** The id of the section's h2 in the document */
  id: string
  title: string
}

/**
 * A long-form legal document on one tinted-glass reading card. From 1024px a sticky sidebar beside it holds Back, a
 * table of contents built from the h2s and the cross links; below that the page is one column, and Back and the links
 * stay inside the card. Both copies are in the markup and CSS shows one, so the server and client render the same.
 */
export function LegalLayout({
  title,
  updated,
  current,
  sections,
  children,
}: {
  title: string
  updated: string
  current: 'terms' | 'privacy'
  sections: LegalSection[]
  children: ReactNode
}) {
  const { t } = useTranslation('auth')
  const router = useRouter()
  // True only when the previous entry is a page of this app, so Back never leaves the site
  const canGoBack = useCanGoBack()

  const backButton = (className: string) => (
    <button
      className={clsx('legal-back', className)}
      type="button"
      onClick={() => {
        if (canGoBack) router.history.back()
        else void router.navigate({ to: '/' })
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
  )

  const crossLinks = (className: string) => (
    <footer className={clsx('legal-footer', className)}>
      <InternalLink href={current === 'terms' ? '/privacy-policy' : '/terms-of-service'}>
        {t(current === 'terms' ? 'terms.privacy' : 'terms.title')}
      </InternalLink>
      <a href="https://discord.gg/8CFgUPxyrU">{t('terms.support')}</a>
    </footer>
  )

  return (
    <div className="legal-page">
      <div className="legal-layout">
        <aside className="legal-sidebar glass-thin">
          {backButton('legal-back--sidebar')}
          <nav aria-labelledby="legal-toc-heading" className="legal-toc">
            {/* Not a heading: the sidebar comes before the document's h1 */}
            <p id="legal-toc-heading" className="legal-toc__heading">
              {t('legal.toc')}
            </p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          {crossLinks('legal-footer--sidebar')}
        </aside>
        <div className="legal-document glass">
          {backButton('legal-back--inline')}
          <header className="legal-title">
            <h1>{title}</h1>
            <p>{updated}</p>
          </header>
          <article className="legal-prose">{children}</article>
          {crossLinks('legal-footer--inline')}
        </div>
      </div>
    </div>
  )
}