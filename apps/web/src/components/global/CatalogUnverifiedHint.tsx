import { type FC, useEffect, useRef, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import IconMdiCloudOffOutline from '~icons/mdi/cloud-off-outline'
import { isLoadedCatalogUnverified, subscribeToCatalog } from '@/catalog/clientCatalog'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

/** Once per tab: after the first time, a page that loads the snapshot again stays quiet */
export const CATALOG_UNVERIFIED_HINT_SHOWN_KEY = 'catalog-unverified-hint-shown'

const wasShown = () => {
  try {
    return sessionStorage.getItem(CATALOG_UNVERIFIED_HINT_SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

const markShown = () => {
  try {
    sessionStorage.setItem(CATALOG_UNVERIFIED_HINT_SHOWN_KEY, '1')
  } catch {
    // Without sessionStorage the hint can come back on the next load; it still shows once per page
  }
}

/**
 * A quiet note when the song catalog came from the copy bundled with the build because the API could not be reached:
 * search and the calculator keep working, but songs added since may be missing. One neutral toast that goes away by
 * itself, once per tab. Client only: the server renders from its own snapshot and the flag is false there.
 */
export const CatalogUnverifiedHint: FC = () => {
  const locale = useLocale()
  const localeRef = useRef(locale)
  localeRef.current = locale
  const unverified = useSyncExternalStore(subscribeToCatalog, isLoadedCatalogUnverified, () => false)

  useEffect(() => {
    if (!unverified || wasShown()) return
    markShown()
    const locale = localeRef.current
    toast(
      <div className="flex flex-col">
        <span className="font-semibold">{m.global_catalogUnverified_title({}, { locale })}</span>
        <span className="text-sm text-fg-2">{m.global_catalogUnverified_description({}, { locale })}</span>
      </div>,
      {
        id: 'catalog-unverified',
        icon: <IconMdiCloudOffOutline aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-2" />,
        duration: 8000,
      },
    )
  }, [unverified])

  return null
}