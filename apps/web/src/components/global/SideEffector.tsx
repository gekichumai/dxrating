import { useRatingEntries } from '@/components/rating/useRatingEntries'
import { authClient } from '@/lib/auth-client'
import { identifyAnalyticsUser, registerAnalyticsContext, resetAnalyticsUser } from '@/lib/analytics'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { type FC, memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEffectOnce } from 'react-use'
import { useRatingCalculatorContext } from '../../models/context/RatingCalculatorContext'
import { useVersionTheme } from '../../utils/useVersionTheme'
import toast from 'react-hot-toast'
import IconMdiCached from '~icons/mdi/cached'
import {
  NET_IMPORT_COOLDOWN_MS,
  NET_IMPORT_LAST_SUCCESS_KEY,
  importFromNETRecords,
} from '../rating/io/import/importFromNETRecords'

const SideEffectorThemeMeta: FC = () => {
  const versionTheme = useVersionTheme()
  useEffect(() => {
    console.info('[theme] Theme changed to', versionTheme)

    document.body.style.backgroundColor = versionTheme.accentColor

    document.head.querySelector('meta[name="theme-color"]')?.setAttribute('content', versionTheme.accentColor)

    document.head
      .querySelector('meta[name="msapplication-TileColor"]')
      ?.setAttribute('content', versionTheme.accentColor)

    document.head.querySelector('link[rel="mask-icon"]')?.setAttribute('color', versionTheme.accentColor)
  }, [versionTheme])

  return null
}

const SideEffectorLocaleMeta: FC = () => {
  const { i18n } = useTranslation()
  useEffect(() => {
    console.info(`[i18n] Language detected as ${i18n.language}`)
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return null
}

const SideEffectorAutoImportRating: FC = () => {
  const { modifyEntries } = useRatingCalculatorContext()
  const { t } = useTranslation()
  const appVersion = useAppContextDXDataVersion()

  useEffect(() => {
    const mode = (() => {
      try {
        const mode = localStorage.getItem('rating-auto-import-from-net')
        if (!mode) return 'disabled'

        const parsed = JSON.parse(mode)
        if (parsed === 'merge') return 'merge'
        if (parsed === 'replace') return 'replace'
        if (parsed === true) return 'replace'
        return 'disabled'
      } catch {
        return 'disabled'
      }
    })() as 'merge' | 'replace' | 'disabled'

    if (mode === 'disabled') return

    // Cooldown: skip auto-import if last success was within 15 minutes
    const lastSuccess = localStorage.getItem(NET_IMPORT_LAST_SUCCESS_KEY)
    if (lastSuccess) {
      const elapsed = Date.now() - Number(lastSuccess)
      if (elapsed < NET_IMPORT_COOLDOWN_MS) {
        const minutes = Math.round(elapsed / 60_000)
        toast(
          <div className="flex flex-col">
            <span className="font-bold">{t('rating-calculator:io.import.net-records.cached.title')}</span>
            <span className="text-sm text-zinc-500">
              {t('rating-calculator:io.import.net-records.cached.description', { minutes: minutes || '<1' })}
            </span>
          </div>,
          {
            id: 'net-import-cached',
            icon: <IconMdiCached className="h-4 w-4 text-zinc-400 shrink-0" />,
            duration: 6000,
          },
        )
        return
      }
    }

    importFromNETRecords(appVersion, modifyEntries, mode)
  }, [appVersion])

  return null
}

const SideEffectorAnalyticsContext: FC<{
  userId?: string
  version: string
  region: string
  language: string
  rating: number
  entryCount: number
}> = ({ userId, version, region, language, rating, entryCount }) => {
  useEffectOnce(() => {
    if (userId) {
      identifyAnalyticsUser(userId)
    } else {
      resetAnalyticsUser()
    }

    registerAnalyticsContext({
      app_surface: 'web',
      game_version: version,
      region,
      language,
      calculated_rating: Number.isFinite(rating) ? rating : 0,
      rating_entry_count: entryCount,
    })
  })

  return null
}

const SideEffectorAnalytics: FC = () => {
  const { data, isPending } = authClient.useSession()
  const { version, region } = useAppContext()
  const { i18n } = useTranslation()
  const { statistics, allEntries } = useRatingEntries()

  const properties = {
    userId: data?.user.id,
    version,
    region,
    language: i18n.language,
    rating: statistics.b50Sum,
    entryCount: allEntries.length,
  }

  if (isPending) return null

  return (
    <SideEffectorAnalyticsContext
      key={JSON.stringify(properties)}
      userId={properties.userId}
      version={properties.version}
      region={properties.region}
      language={properties.language}
      rating={properties.rating}
      entryCount={properties.entryCount}
    />
  )
}

export const SideEffector: FC = memo(() => {
  return (
    <>
      <SideEffectorThemeMeta />
      <SideEffectorLocaleMeta />
      <SideEffectorAutoImportRating />
      <SideEffectorAnalytics />
    </>
  )
})