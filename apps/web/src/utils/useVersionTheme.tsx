import { DXVersionToDXDataVersionEnumMap } from '../models/context/AppContext'
import { useAppContext } from '../models/context/useAppContext'
import { DEFAULT_VERSION_THEME_KEY, VERSION_THEME } from '../theme'

export const useVersionTheme = () => {
  const { version } = useAppContext()
  const theme = VERSION_THEME[DXVersionToDXDataVersionEnumMap[version]] ?? VERSION_THEME[DEFAULT_VERSION_THEME_KEY]!

  return theme
}
