import { Button } from '@mui/material'
import { Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function NotFoundContent() {
  const { t } = useTranslation(['root'])

  return (
    <div className="page-gutter flex min-h-80 items-center justify-center py-12">
      <section className="glass flex w-full max-w-2xl flex-col items-center gap-5 px-6 py-8 text-center sm:px-8">
        <div className="flex h-8 items-center justify-center glass-inset px-3 text-sm font-semibold tracking-[0.05em] text-fg-2 num">
          404
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="page-title m-0 sm:text-4xl">{t('root:not-found.title')}</h1>
          <p className="page-description m-0 max-w-sm">{t('root:not-found.description')}</p>
        </div>

        <Button variant="contained" href="/" startIcon={<Home className="size-4" aria-hidden="true" />}>
          {t('root:not-found.back-to-home')}
        </Button>
      </section>
    </div>
  )
}