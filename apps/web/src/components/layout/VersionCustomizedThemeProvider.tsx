import { Fade, useMediaQuery } from '@mui/material'
import {
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendTheme,
} from '@mui/material/styles'
import { MotionConfig } from 'motion/react'
import { type FC, type PropsWithChildren, useMemo } from 'react'
import { useVersionTheme } from '../../utils/useVersionTheme'
import { THEME_ATTRIBUTE, THEME_COLOR_SCHEME_STORAGE_KEY, THEME_MODE_STORAGE_KEY } from '@/setup/theme-script'

// MUI surfaces on the tinted-glass tokens in src/styles/tokens.css, so dialogs, menus, popovers, drawers, tooltips
// and alerts match the rest of the app instead of opaque white paper
const glassOverlay = {
  backgroundColor: 'var(--glass-overlay-bg)',
  backgroundImage: 'none',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--glass-border)',
  boxShadow: 'var(--glass-highlight), var(--shadow-overlay)',
} as const

const alertTint = (color: string) => ({
  backgroundColor: `color-mix(in oklab, ${color} 9%, var(--glass-bg))`,
  border: `1px solid color-mix(in oklab, ${color} 22%, transparent)`,
})

export const VersionCustomizedThemeProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const versionTheme = useVersionTheme()
  // Under reduced motion, overlays fade instead of scaling or sliding; Motion follows the same preference
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: false })

  const theme = useMemo(() => {
    // Both colour schemes become CSS variables keyed off <html data-theme> (set before paint by theme-script.ts), so
    // the server and the first client render produce the same markup whichever theme is showing. Palette colours
    // must be literal here (MUI derives channels from them); they mirror --fg-1/--fg-2 in tokens.css and dark.css.
    return extendTheme({
      shape: {
        // --radius-md: controls (buttons, inputs, chips, list rows, menu items)
        borderRadius: 8,
      },
      typography: {
        // Inherit so the document's per-language font stack (src/styles/tokens.css) reaches MUI text too
        fontFamily: 'inherit',
        // Torus ships 400 and 600 only
        fontWeightMedium: 600,
        fontWeightBold: 600,
        button: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
      colorSchemes: {
        light: {
          palette: {
            primary: {
              // The strong accent passes 4.5:1 for white text on it and for it as text on glass, in every version
              main: versionTheme.accentStrongColor,
              contrastText: '#fff',
            },
            // --danger (tokens.css): MUI's default red reaches only 4.2:1 as text on glass
            error: {
              main: '#b91c1c',
              contrastText: '#fff',
            },
            text: {
              primary: '#18181b',
              secondary: '#52525b',
            },
          },
        },
        dark: {
          palette: {
            primary: {
              // Lightened for dark glass; fills of it carry dark text (--on-accent), ≥4.5:1 in every version
              main: versionTheme.accentStrongDarkColor,
              contrastText: '#111114',
            },
            // --danger (dark.css). Fills carry dark text, so the hover shade (`dark`, contained buttons) is set rather
            // than derived: MUI's darkened #f87171 is rgb(173 79 79), 3.6:1 under #111114; #ef4444 keeps 5.0:1
            error: {
              main: '#f87171',
              dark: '#ef4444',
              contrastText: '#111114',
            },
            text: {
              primary: '#f4f4f5',
              secondary: '#b4b4bd',
            },
            background: {
              default: '#0f0f12',
              paper: '#1a1a1f',
            },
          },
        },
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: glassOverlay,
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              backgroundColor: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              boxShadow: 'var(--glass-highlight), var(--shadow-1)',
              borderRadius: 'var(--radius-lg)',
            },
          },
        },
        MuiPopover: {
          defaultProps: reducedMotion ? { TransitionComponent: Fade } : {},
          styleOverrides: {
            // Menu items sit at a 4px list inset: 8 + 4 = 12
            paper: { borderRadius: 'var(--radius-lg)', overscrollBehavior: 'contain' },
          },
        },
        MuiMenu: {
          defaultProps: reducedMotion ? { TransitionComponent: Fade } : {},
          styleOverrides: {
            list: { padding: 4 },
          },
        },
        MuiMenuItem: {
          styleOverrides: {
            root: { borderRadius: 'var(--radius-md)' },
          },
        },
        MuiListSubheader: {
          styleOverrides: {
            root: {
              backgroundColor: 'var(--glass-overlay-bg)',
              lineHeight: 2.5,
            },
          },
        },
        MuiDialog: {
          defaultProps: reducedMotion ? { TransitionComponent: Fade } : {},
          styleOverrides: {
            paper: { borderRadius: 'var(--radius-xl)' },
          },
        },
        MuiDialogContent: {
          styleOverrides: {
            root: { overscrollBehavior: 'contain' },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paperAnchorBottom: {
              borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
              borderBottom: 'none',
              overscrollBehavior: 'contain',
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: 'rgb(24 24 27 / 0.86)',
              [`[${THEME_ATTRIBUTE}="dark"] &`]: {
                backgroundColor: 'rgb(63 63 70 / 0.92)',
                border: '1px solid rgb(255 255 255 / 0.1)',
              },
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              lineHeight: 1.4,
            },
          },
        },
        MuiAlert: {
          styleOverrides: {
            // Glass tinted with the severity colour instead of a flat pastel fill
            root: {
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--glass-highlight), var(--shadow-1)',
            },
            standardInfo: alertTint('#0288d1'),
            standardSuccess: alertTint('#2e7d32'),
            standardWarning: alertTint('#ed6c02'),
            standardError: alertTint('#d32f2f'),
            message: { color: 'var(--fg-1)' },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
        },
        MuiTab: {
          styleOverrides: {
            root: { textTransform: 'none', fontWeight: 600 },
          },
        },
        MuiTextField: {
          defaultProps: { variant: 'outlined' },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: { backgroundColor: 'var(--glass-inset-bg)' },
          },
        },
      },
    })
  }, [versionTheme, reducedMotion])

  return (
    <CssVarsProvider
      theme={theme}
      attribute={THEME_ATTRIBUTE}
      modeStorageKey={THEME_MODE_STORAGE_KEY}
      colorSchemeStorageKey={THEME_COLOR_SCHEME_STORAGE_KEY}
      defaultMode="system"
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </CssVarsProvider>
  )
}