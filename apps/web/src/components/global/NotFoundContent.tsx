import { Button } from '@mui/material'
import { Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function NotFoundContent() {
  const { t } = useTranslation(['root'])

  return (
    <main className="mx-auto flex min-h-80 w-full max-w-2xl items-center justify-center px-4 py-12 text-zinc-950">
      <section className="flex w-full flex-col items-center gap-5 rounded-lg bg-white/82 px-6 py-8 text-center shadow-[0_18px_45px_rgba(24,16,48,0.18),0_1px_0_rgba(255,255,255,0.65)_inset] backdrop-blur-md sm:px-8">
        <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-black/8 px-3 text-sm font-bold tracking-[0.12em] text-black/65">
          404
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="m-0 text-balance text-3xl font-bold leading-tight text-black/85 sm:text-4xl">
            {t('root:not-found.title')}
          </h1>
          <p className="m-0 max-w-sm text-pretty text-base leading-6 text-black/62">
            {t('root:not-found.description')}
          </p>
        </div>

        <Button
          variant="contained"
          href="/"
          startIcon={<Home className="size-4" aria-hidden="true" />}
          className="min-h-10 rounded-lg px-5 shadow-lg shadow-black/15 transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.96]"
        >
          {t('root:not-found.back-to-home')}
        </Button>
      </section>
    </main>
  )
}
