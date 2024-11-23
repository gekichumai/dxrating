import { createTheme, ThemeProvider } from '@mui/material'
import { FC, PropsWithChildren, useMemo } from 'react'
import { useVersionTheme } from '../../utils/useVersionTheme'

export const VersionCustomizedThemeProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const versionTheme = useVersionTheme()

  const theme = useMemo(() => {
    return createTheme({
      shape: {
        borderRadius: 12,
      },
      typography: {
        fontFamily: 'Torus, system-ui, Avenir, Helvetica, Arial, sans-serif',
      },
      palette: {
        primary: {
          main: versionTheme.accentColor,
        },
      },
    })
  }, [versionTheme])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
