// Light / dark theme, resolved before first paint.
//
// The choice (light, dark or system) is remembered in localStorage under THEME_MODE_STORAGE_KEY, the key MUI's
// CssVarsProvider reads and writes (VersionCustomizedThemeProvider), so the toggle, MUI and this script agree. The
// resolved theme is the `data-theme` attribute on <html>, which tokens (src/styles/dark.css), MUI's CSS variables and
// the UnoCSS `dark:` variant all key off.
//
// The server cannot know the theme (the HTML is cached per locale and path, html-cache.ts), so nothing theme-specific
// is rendered: the root route renders this script in the <head>, where it runs before the body is parsed; like every
// inline script of the page, it carries the nonce of the response. Without JavaScript the page stays light.

export const THEME_MODE_STORAGE_KEY = 'dxrating-theme'
export const THEME_COLOR_SCHEME_STORAGE_KEY = 'dxrating-color-scheme'
export const THEME_ATTRIBUTE = 'data-theme'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_INLINE_SCRIPT = `(function(){var m;try{m=localStorage.getItem(${JSON.stringify(
  THEME_MODE_STORAGE_KEY,
)})}catch(e){}if(m!=="light"&&m!=="dark"){m=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},m)})()`