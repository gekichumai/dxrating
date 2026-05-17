import { VersionEnum } from '@gekichumai/dxdata'
import { createContext, type FC, type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react'

type AppContext = AppContextStates & AppContextFns

export type DXVersion = 'festival-plus' | 'buddies' | 'buddies-plus' | 'prism' | 'prism-plus' | 'circle' | 'circle-plus'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  'festival-plus': VersionEnum.FESTiVALPLUS,
  buddies: VersionEnum.BUDDiES,
  'buddies-plus': VersionEnum.BUDDiESPLUS,
  prism: VersionEnum.PRiSM,
  'prism-plus': VersionEnum.PRiSMPLUS,
  circle: VersionEnum.CiRCLE,
  'circle-plus': VersionEnum.CiRCLEPLUS,
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

function getDefaultAppContext(): AppContextStates {
  return {
    version: 'circle-plus',
    region: 'jp',
  }
}

function isAppContextStates(value: unknown): value is AppContextStates {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AppContextStates>
  return (
    typeof candidate.version === 'string' &&
    candidate.version in DXVersionToDXDataVersionEnumMap &&
    ['jp', 'intl', 'cn', '_generic'].includes(candidate.region ?? '')
  )
}

function readStoredAppContext(): AppContextStates {
  if (typeof window === 'undefined') return getDefaultAppContext()

  try {
    const stored = window.localStorage.getItem('app-context')
    if (!stored) return getDefaultAppContext()

    const parsed = JSON.parse(stored)
    return isAppContextStates(parsed) ? parsed : getDefaultAppContext()
  } catch {
    return getDefaultAppContext()
  }
}

export const AppContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [state, setState] = useState<AppContextStates>(() => getDefaultAppContext())

  useEffect(() => {
    setState(readStoredAppContext())
  }, [])

  const setVersionAndRegion = useCallback((version: DXVersion, region: Region) => {
    const next = { version, region }
    setState(next)
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
    }),
    [state, setVersionAndRegion],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}