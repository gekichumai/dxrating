import { VersionEnum } from '@gekichumai/dxdata'
import { createContext, type FC, type PropsWithChildren, useMemo, useState } from 'react'

type AppContext = AppContextStates & AppContextFns

export type DXVersion = 'festival-plus' | 'buddies' | 'buddies-plus' | 'prism' | 'prism-plus' | 'circle'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  'festival-plus': VersionEnum.FESTiVALPLUS,
  buddies: VersionEnum.BUDDiES,
  'buddies-plus': VersionEnum.BUDDiESPLUS,
  prism: VersionEnum.PRiSM,
  'prism-plus': VersionEnum.PRiSMPLUS,
  circle: VersionEnum.CiRCLE,
}

export interface AppContextStates {
  version: DXVersion
  region: Region
}

interface AppContextFns {
  setVersionAndRegion: (version: DXVersion, region: Region) => void
}

export const AppContext = createContext<AppContext>({
  version: 'circle',
  region: 'jp',
  setVersionAndRegion: () => {
    throw new Error('AppContext not initialized')
  },
})

function getDefaultAppContext(): AppContextStates {
  return {
    version: 'circle',
    region: 'jp',
  }
}

function readFromLocalStorage(): AppContextStates {
  if (typeof window === 'undefined') return getDefaultAppContext()
  try {
    const stored = localStorage.getItem('app-context')
    if (stored) return JSON.parse(stored) as AppContextStates
  } catch {}
  return getDefaultAppContext()
}

export const AppContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [state, setStateRaw] = useState<AppContextStates>(readFromLocalStorage)

  const setState = (next: AppContextStates) => {
    setStateRaw(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-context', JSON.stringify(next))
    }
  }

  const value = useMemo<AppContext>(
    () => ({
      version: state.version,
      region: state.region ?? 'jp',
      setVersionAndRegion: (version, region) => setState({ version, region }),
    }),
    [state],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}