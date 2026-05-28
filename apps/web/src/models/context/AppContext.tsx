import type { VersionEnum } from '@gekichumai/dxdata'
import { createContext, type FC, type PropsWithChildren, useCallback, useMemo, useState } from 'react'

type AppContext = AppContextStates & AppContextFns

export type DXVersion = 'festival-plus' | 'buddies' | 'buddies-plus' | 'prism' | 'prism-plus' | 'circle' | 'circle-plus'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export const APP_CONTEXT_STORAGE_KEY = 'app-context'
export const APP_CONTEXT_COOKIE_NAME = 'dxrating.app_context'

const APP_CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const dxDataVersion = (value: string) => value as VersionEnum

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  'festival-plus': dxDataVersion('FESTiVAL PLUS'),
  buddies: dxDataVersion('BUDDiES'),
  'buddies-plus': dxDataVersion('BUDDiES PLUS'),
  prism: dxDataVersion('PRiSM'),
  'prism-plus': dxDataVersion('PRiSM PLUS'),
  circle: dxDataVersion('CiRCLE'),
  'circle-plus': dxDataVersion('CiRCLE PLUS'),
}

export const DXVersionToSlugMap: Record<DXVersion, string> = {
  'festival-plus': 'festival-plus',
  buddies: 'buddies',
  'buddies-plus': 'buddies-plus',
  prism: 'prism',
  'prism-plus': 'prism-plus',
  circle: 'circle',
  'circle-plus': 'circle-plus',
}

export interface AppContextStates {
  version: DXVersion
  region: Region
}

interface AppContextFns {
  setVersionAndRegion: (version: DXVersion, region: Region) => void
}

export const AppContext = createContext<AppContext>({
  version: 'circle-plus',
  region: 'jp',
  setVersionAndRegion: () => {
    throw new Error('AppContext not initialized')
  },
})

export function getDefaultAppContext(): AppContextStates {
  return {
    version: 'circle-plus',
    region: 'jp',
  }
}

export function isAppContextStates(value: unknown): value is AppContextStates {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AppContextStates>
  return (
    typeof candidate.version === 'string' &&
    candidate.version in DXVersionToDXDataVersionEnumMap &&
    ['jp', 'intl', 'cn', '_generic'].includes(candidate.region ?? '')
  )
}

function parseAppContextState(value: string | null): AppContextStates | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return isAppContextStates(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function readAppContextFromCookieHeader(cookieHeader: string | null): AppContextStates | null {
  const cookie = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_CONTEXT_COOKIE_NAME}=`))

  if (!cookie) return null

  try {
    return parseAppContextState(decodeURIComponent(cookie.slice(APP_CONTEXT_COOKIE_NAME.length + 1)))
  } catch {
    return null
  }
}

function buildAppContextCookieValue(state: AppContextStates) {
  return `${APP_CONTEXT_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify(state),
  )}; Max-Age=${APP_CONTEXT_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`
}

export function persistAppContext(state: AppContextStates) {
  window.localStorage.setItem(APP_CONTEXT_STORAGE_KEY, JSON.stringify(state))
  document.cookie = buildAppContextCookieValue(state)
}

function readStoredAppContext(): AppContextStates {
  if (typeof window === 'undefined') return getDefaultAppContext()

  try {
    return parseAppContextState(window.localStorage.getItem(APP_CONTEXT_STORAGE_KEY)) ?? getDefaultAppContext()
  } catch {
    return getDefaultAppContext()
  }
}

export const AppContextProvider: FC<PropsWithChildren<{ initialState?: AppContextStates | null }>> = ({
  children,
  initialState,
}) => {
  const [state, setState] = useState<AppContextStates>(() =>
    typeof window === 'undefined' ? (initialState ?? getDefaultAppContext()) : readStoredAppContext(),
  )

  const setVersionAndRegion = useCallback((version: DXVersion, region: Region) => {
    const next = { version, region }
    setState(next)
    try {
      persistAppContext(next)
    } catch {
      // Keep the in-memory state change even when storage is unavailable.
    }
  }, [])

  const value = useMemo<AppContext>(
    () => ({
      version: state.version,

      region: state.region ?? 'jp',
      setVersionAndRegion,
    }),
    [state, setVersionAndRegion],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
