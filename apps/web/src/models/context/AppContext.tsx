import { VERSION_ID_MAP, VersionEnum } from '@gekichumai/dxdata'
import { LATEST_REGION_VERSIONS as DOMAIN_LATEST_REGION_VERSIONS } from '@gekichumai/maimai-domain'
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

const toDXVersion = (version: VersionEnum): DXVersion => {
  const entry = Object.entries(DXVersionToDXDataVersionEnumMap).find(([, value]) => value === version)
  if (!entry) throw new Error(`No DXVersion for ${version}`)
  return entry[0] as DXVersion
}

/** The version each region runs now, from the shared table in @gekichumai/maimai-domain */
export const LATEST_REGION_VERSIONS = {
  jp: toDXVersion(DOMAIN_LATEST_REGION_VERSIONS.jp),
  intl: toDXVersion(DOMAIN_LATEST_REGION_VERSIONS.intl),
  cn: toDXVersion(DOMAIN_LATEST_REGION_VERSIONS.cn),
} satisfies Record<Exclude<Region, '_generic'>, DXVersion>

/**
 * Stored choices to move forward without asking. CN's latest was listed as PRiSM until PRiSM PLUS was added, so a
 * `prism` + `cn` choice was the picker's "latest CN", not a deliberate pick of an older version.
 */
export function migrateStoredAppContext(state: AppContextStates): AppContextStates {
  if (state.region === 'cn' && state.version === 'prism') return { ...state, version: LATEST_REGION_VERSIONS.cn }
  return state
}

export interface AppContextStates {
  version: DXVersion
  region: Region
}

interface AppContextFns {
  /** False on the server and until the stored choice has been applied after mount: the region is the default until then */
  hydrated: boolean
  availableVersionUpdate: DXVersion | null
  dismissVersionUpdate: () => void
  setVersionAndRegion: (version: DXVersion, region: Region) => void
}

export const AppContext = createContext<AppContext>({
  version: 'magical',
  region: 'jp',
  hydrated: false,
  availableVersionUpdate: null,
  dismissVersionUpdate: () => {},
  setVersionAndRegion: () => {
    throw new Error('AppContext not initialized')
  },
})

/** The version and region of server renders and of the first client render, before stored preferences apply */
export function getDefaultAppContext(): AppContextStates {
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

export function readStoredAppContext(): AppContextStates {
  if (typeof window === 'undefined') return getDefaultAppContext()

  try {
    const stored = window.localStorage.getItem('app-context')
    if (!stored) return getDefaultAppContext()

    const parsed = JSON.parse(stored)
    if (!isAppContextStates(parsed)) return getDefaultAppContext()
    const migrated = migrateStoredAppContext(parsed)
    if (migrated !== parsed) {
      try {
        window.localStorage.setItem('app-context', JSON.stringify(migrated))
      } catch {
        // Migrated again next visit; this visit still uses the migrated choice
      }
    }
    return migrated
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
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredAppContext()
    setState(stored)
    setAvailableVersionUpdate(getAvailableVersionUpdate(stored))
    setHydrated(true)
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
      hydrated,
      setVersionAndRegion,
      availableVersionUpdate,
      dismissVersionUpdate,
    }),
    [state, hydrated, setVersionAndRegion, availableVersionUpdate, dismissVersionUpdate],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}