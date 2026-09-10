import { useTranslation } from 'react-i18next'

export function RatingIntroduction() {
  const { t } = useTranslation(['root'])

  return (
    <header className="flex-container !items-start !gap-3">
      <h1 className="m-0 text-xl sm:text-2xl font-bold tracking-tight text-balance">
        {t('root:pages.rating.heading')}
      </h1>
      <p className="m-0 max-w-3xl text-sm leading-relaxed text-zinc-600 text-pretty">
        {t('root:pages.rating.introduction')}
      </p>
      <a
        href="#rating-calculator"
        className="inline-flex min-h-10 items-center text-blue-800 underline underline-offset-4 hover:text-blue-600"
      >
        {t('root:pages.rating.start')}
      </a>
      <details className="w-full text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold">{t('root:pages.rating.guide')}</summary>
        <ol className="m-0 max-w-3xl pl-5 flex flex-col gap-3 leading-relaxed">
          <li>
            <h2 className="m-0 text-sm font-semibold">{t('root:pages.rating.import-heading')}</h2>
            <p className="m-0 text-zinc-600">{t('root:pages.rating.import-description')}</p>
          </li>
          <li>
            <h2 className="m-0 text-sm font-semibold">{t('root:pages.rating.calculate-heading')}</h2>
            <p className="m-0 text-zinc-600">{t('root:pages.rating.calculate-description')}</p>
          </li>
          <li>
            <h2 className="m-0 text-sm font-semibold">{t('root:pages.rating.share-heading')}</h2>
            <p className="m-0 text-zinc-600">{t('root:pages.rating.share-description')}</p>
          </li>
        </ol>
      </details>
    </header>
  )
}

export function RatingLoading() {
  const { t } = useTranslation(['root'])
  return <output className="flex-container text-sm text-zinc-600">{t('root:pages.rating.loading')}</output>
}