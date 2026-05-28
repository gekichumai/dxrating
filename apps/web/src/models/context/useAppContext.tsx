import { useContext } from 'react'
import { AppContext, DXVersionToDXDataVersionEnumMap, DXVersionToSlugMap } from './AppContext'

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('Missing AppContextProvider')
  }
  return context
}

export const useAppContextDXDataVersion = () => {
  const { version } = useAppContext()
  return DXVersionToDXDataVersionEnumMap[version]
}

export const useAppContextSlugVersion = () => {
  const { version } = useAppContext()
  return DXVersionToSlugMap[version]
}
