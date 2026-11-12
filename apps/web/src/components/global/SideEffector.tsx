import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { useRatingEntries } from '@/components/rating/useRatingEntries'
import { authClient } from '@/lib/auth-client'
import { identifyAnalyticsUser, registerAnalyticsContext, resetAnalyticsUser } from '@/lib/analytics'
import type { DXVersion, Region } from '@/models/context/AppContext'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { type FC, memo, useEffect, useRef } from 'react'
import { useEffectOnce } from 'react-use'
import { useScoreRepository } from '../../models/scores/useScoreRepository'
import { useActiveSave } from '../../models/scores/ActiveSaveContext'
import { autoNetImportKey } from '../../models/scores/cloudImports'
import { useVersionTheme } from '../../utils/useVersionTheme'
import toast from 'react-hot-toast'
import IconMdiCached from '~icons/mdi/cached'
import {
  NET_IMPORT_COOLDOWN_MS,
  NET_IMPORT_LAST_SUCCESS_KEY,
  importFromNETRecords,
} from '../rating/io/import/importFromNETRecords'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { CatalogUnverifiedHint } from './CatalogUnverifiedHint'

const SideEffectorThemeMeta: FC = () => {
  const versionTheme = useVersionTheme()
  useEffect(() => {
    console.info('[theme] Theme changed to', versionTheme)

    document.head.querySelector('link[rel="mask-icon"]')?.setAttribute('color', versionTheme.accentColor)
  }, [versionTheme])

  return null
}

const SideEffectorLocaleMeta: FC = () => {
  const locale = useLocale()
  useEffect(() => {
    console.info(`[i18n] Language detected as ${locale}`)
    document.documentElement.lang = locale
  }, [locale])

  return null
}

/** @internal Exported for tests */
export const SideEffectorAutoImportRating: FC = () => {
  const repository = useScoreRepository()
  const activeSave = useActiveSave()
  const locale = useLocale()
  // An import resolves records against the catalog: run it once the complete catalog has loaded
  const catalog = useCompleteSongCatalog()
  // Into the save the visitor works on: wait until the choice of save is made. Once per catalog, as before
  const startedForRef = useRef<typeof catalog>(null)

  useEffect(() => {
    if (!catalog || !activeSave.decided || startedForRef.current === catalog) return
    startedForRef.current = catalog
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
            <span className="font-bold">{m.ratingCalculator_io_import_netRecords_cached_title({})}</span>
            <span className="text-sm text-zinc-500">
              {m.ratingCalculator_io_import_netRecords_cached_description({ minutes: minutes || '<1' })}
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

    // A cloud save imports on the server (design §8.3, §5.5): trigger `auto`, one key per save and 15 minutes, so
    // tabs and reloads in the same window attach to one job. With server imports off the browser fetches and
    // uploads the records as client_reported (§7.4, see `importFromNETRecords`)
    const cloud =
      repository.kind === 'cloud' && activeSave.saveId
        ? { trigger: 'auto' as const, idempotencyKey: autoNetImportKey(activeSave.saveId) }
        : undefined
    importFromNETRecords(catalog, repository, mode, undefined, undefined, cloud)
  }, [catalog, activeSave.decided, activeSave.saveId, repository, locale])

  return null
}

const SideEffectorAnalyticsContext: FC<{
  userId?: string
  version: DXVersion
  region: Region
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
  const locale = useLocale()
  const { isLoading: entriesLoading, statistics, allEntries } = useRatingEntries()

  const properties = {
    userId: data?.user.id,
    version,
    region,
    language: locale,
    rating: statistics.b50Sum,
    entryCount: allEntries.length,
  }

  // Register the rating once the entries are resolved, not the empty lists of the catalog's loading
  if (isPending || entriesLoading) return null

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
      <CatalogUnverifiedHint />
    </>
  )
})