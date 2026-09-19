import { VERSION_ID_MAP, VersionEnum } from '@gekichumai/dxdata'
import { createContext, type FC, type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react'

type AppContext = AppContextStates & AppContextFns

export type DXVersion =
  | 'festival-plus'
  | 'buddies'
  | 'buddies-plus'
  | 'prism'
  | 'prism-plus'
  | 'circle'
  | 'circle-plus'
  | 'magical'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  'festival-plus': VersionEnum.FESTiVALPLUS,
  buddies: VersionEnum.BUDDiES,
  'buddies-plus': VersionEnum.BUDDiESPLUS,
  prism: VersionEnum.PRiSM,
  'prism-plus': VersionEnum.PRiSMPLUS,
  circle: VersionEnum.CiRCLE,
  'circle-plus': VersionEnum.CiRCLEPLUS,
  magical: VersionEnum.MAGiCAL,
}

export const LATEST_REGION_VERSIONS = {
  jp: 'magical',
  intl: 'circle-plus',
  cn: 'prism',
} as const satisfies Record<Exclude<Region, '_generic'>, DXVersion>

export interface AppContextStates {
  version: DXVersion
  region: Region
}

interface AppContextFns {
  availableVersionUpdate: DXVersion | null
  dismissVersionUpdate: () => void
  setVersionAndRegion: (version: DXVersion, region: Region) => void
}

export const AppContext = createContext<AppContext>({
  version: 'magical',
  region: 'jp',
  availableVersionUpdate: null,
  dismissVersionUpdate: () => {},
  setVersionAndRegion: () => {
    throw new Error('AppContext not initialized')
  },
})

function getDefaultAppContext(): AppContextStates {
  return {
    version: 'magical',
    region: 'jp',
  }
}

function isAppContextStates(value: unknown): value is AppContextStates {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AppContextStates>
  return (
    typeof candidate.version === 'string' &&
    Object.hasOwn(DXVersionToDXDataVersionEnumMap, candidate.version) &&
    ['jp', 'intl', 'cn', '_generic'].includes(candidate.region ?? '')
  )
}

function readStoredAppContext(): AppContextStates {
  if (typeof window === 'undefined') return getDefaultAppContext()

  try {
    const stored = window.localStorage.getItem('app-context')
    if (!stored) return getDefaultAppContext()

    const parsed = JSON.parse(stored)
    if (!isAppContextStates(parsed)) return getDefaultAppContext()
    return parsed
  } catch {
    return getDefaultAppContext()
  }
}

function updateDismissalKey(region: Region, version: DXVersion) {
  return `region-version-update-dismissed:${region}:${version}`
}

function getAvailableVersionUpdate(state: AppContextStates): DXVersion | null {
  if (state.region === '_generic') return null
  const latest = LATEST_REGION_VERSIONS[state.region]
  const currentId = VERSION_ID_MAP.get(DXVersionToDXDataVersionEnumMap[state.version])!
  const latestId = VERSION_ID_MAP.get(DXVersionToDXDataVersionEnumMap[latest])!
  if (currentId >= latestId) return null
  try {
    if (window.localStorage.getItem(updateDismissalKey(state.region, latest)) === 'true') return null
  } catch {
    // The user can still choose a version when storage is unavailable.
  }
  return latest
}

export const AppContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [state, setState] = useState<AppContextStates>(() => getDefaultAppContext())

  const [availableVersionUpdate, setAvailableVersionUpdate] = useState<DXVersion | null>(null)

  useEffect(() => {
    const stored = readStoredAppContext()
    setState(stored)
    setAvailableVersionUpdate(getAvailableVersionUpdate(stored))
  }, [])

  const dismissVersionUpdate = useCallback(() => {
    if (!availableVersionUpdate) return
    setAvailableVersionUpdate(null)
    try {
      window.localStorage.setItem(updateDismissalKey(state.region, availableVersionUpdate), 'true')
    } catch {
      // Keep the prompt dismissed for this visit even when storage is unavailable.
    }
  }, [state.region, availableVersionUpdate])

  const setVersionAndRegion = useCallback((version: DXVersion, region: Region) => {
    const next = { version, region }
    setState(next)
    setAvailableVersionUpdate(null)
    try {
      window.localStorage.setItem('app-context', JSON.stringify(next))
    } catch {
      // Keep the in-memory state change even when storage is unavailable.
    }
  }, [])

  const value = useMemo<AppContext>(
    () => ({
      version: state.version,

      region: state.region ?? 'jp',
      setVersionAndRegion,
      availableVersionUpdate,
      dismissVersionUpdate,
    }),
    [state, setVersionAndRegion, availableVersionUpdate, dismissVersionUpdate],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}