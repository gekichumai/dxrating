// uno.config.ts
import { handler } from '@unocss/preset-mini/utils'
import presetTypography from '@unocss/preset-typography'
import presetWind from '@unocss/preset-wind'
import { defineConfig, presetUno } from 'unocss'
import presetAnimations from 'unocss-preset-animations'
import { adaptivePaletteCss, adaptiveThemeColors } from './src/styles/adaptive-palette'

// Surface uses of white and black (`bg-white/90`, `border-black/8`, `text-black/60`, …) follow the theme: white becomes
// the dark surface colour and black becomes light ink under html[data-theme="dark"] (tokens.css: --surface-rgb,
// --ink-rgb). `text-white` and the other white/black text on coloured fills are left alone.
const SURFACE_WHITE = /(?:^|[.:!\\-])(?:bg|border|divide|outline|ring|from|via|to)-white(?![\w-])/
const SURFACE_BLACK = /(?:^|[.:!\\-])(?:bg|border|divide|outline|ring|from|via|to|text)-black(?![\w-])/

export default defineConfig({
  rules: [
    ['font-rounded', { 'font-family': 'Torus' }],
    // Numbers below 20px: tabular Nunito digits in front of the locale stack. Big headline numbers use `display-num`
    // (the brand font). See "Numbers" in src/styles/tokens.css
    ['num', { 'font-family': 'var(--font-numeric)', 'font-variant-numeric': 'tabular-nums' }],
    ['display-num', { 'font-family': 'var(--font-sans)', 'font-variant-numeric': 'normal' }],
    [
      'p-safe',
      {
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
    ],
    ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
    ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
    ['pl-safe', { 'padding-left': 'env(safe-area-inset-left)' }],
    ['pr-safe', { 'padding-right': 'env(safe-area-inset-right)' }],
    ['pb-global', { 'padding-bottom': 'calc(env(safe-area-inset-bottom) + 5rem)' }],
    [
      /^bg-gradient-(?:repeating-)?linear-(.+)$/,
      ([, s]) => ({
        'background-image': `linear-gradient${handler.bracket(s)}`,
      }),
    ],
    [
      'touch-callout-none',
      {
        '-webkit-touch-callout': 'none',
      },
    ],
  ],
  theme: {
    // Semantic colours from src/styles/tokens.css: `text-fg-2`, `text-accent-strong`, `bg-accent-subtle`, …
    colors: {
      // zinc, slate, gray, neutral, stone and the chromatic scales resolve to variables that mirror in dark mode
      ...adaptiveThemeColors(),
      surface: 'rgb(var(--surface-rgb) / %alpha)',
      ink: 'rgb(var(--ink-rgb) / %alpha)',
      accent: {
        DEFAULT: 'var(--accent)',
        strong: 'var(--accent-strong)',
        subtle: 'var(--accent-subtle)',
      },
      'on-accent': 'var(--on-accent)',
      fg: {
        1: 'var(--fg-1)',
        2: 'var(--fg-2)',
      },
      danger: 'var(--danger)',
      status: {
        positive: 'var(--status-positive)',
        warning: 'var(--status-warning)',
      },
    },
    fontFamily: {
      mono: '"IBM Plex Mono", "JetBrains Mono", Menlo, Consolas, Courier, monospace',
    },
    breakpoints: {
      '3xs': '320px', // Very small phones
      '2xs': '375px', // Small phones
      xs: '480px', // Large phones
      sm: '640px', // Small tablets
      md: '768px', // Tablets
      lg: '1024px', // Small laptops
      xl: '1280px', // Laptops
      '2xl': '1536px', // Large screens
      '3xl': '1920px', // Very large screens
    },
  },
  variants: [
    // `hover:` only applies on devices that can hover: on touch, :hover stays on whatever was tapped last
    {
      name: 'hover-capable',
      order: -1,
      match: (matcher) =>
        matcher.startsWith('hover:')
          ? { matcher: matcher.slice('hover:'.length), selector: (s) => `${s}:hover`, parent: '@media (hover: hover)' }
          : undefined,
    },
  ],
  preflights: [{ getCSS: () => adaptivePaletteCss() }],
  postprocess: (util) => {
    const white = SURFACE_WHITE.test(util.selector)
    const black = SURFACE_BLACK.test(util.selector)
    if (!white && !black) return
    util.entries = util.entries.map(([prop, value]) => [
      prop,
      typeof value === 'string'
        ? value
            .replace(white ? /rgb\(255 255 255(?= |\))/g : /$^/, 'rgb(var(--surface-rgb)')
            .replace(black ? /rgb\(0 0 0(?= |\))/g : /$^/, 'rgb(var(--ink-rgb)')
        : value,
    ])
  },
  shortcuts: {
    'flex-container':
      'flex flex-col items-center justify-center py-4 gap-4 max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)]',
    // Tinted-glass surfaces: the material is defined on these class names in src/styles/tokens.css (shortcuts cannot
    // expand stylesheet classes), the shortcuts add the radius. Never a flat solid fill. glass-bar (header) is CSS only.
    // glass: page panels and cards. glass-thin: lighter, for controls floating on the background (tab bar).
    // glass-inset: nested inside another glass surface (no second blur). glass-overlay: dialogs, menus, popovers.
    glass: 'rounded-[var(--radius-lg)]',
    'glass-thin': 'rounded-[var(--radius-lg)]',
    'glass-inset': 'rounded-[var(--radius-md)]',
    'glass-overlay': 'rounded-[var(--radius-xl)]',
    // Kept as aliases for existing call sites
    'material-surface': 'rounded-[var(--radius-lg)]',
    'material-surface-thin': 'rounded-[var(--radius-lg)]',
    // An inline link that reads as a link: accent text that passes 4.5:1 on glass, underlined
    link: 'text-accent-strong underline decoration-1 underline-offset-2 hover:decoration-2',
    // Secondary text: never zinc-400/500 or opacity, which fail contrast on glass
    'text-secondary': 'text-fg-2',
    // Page frame: one gutter (with the safe-area insets) and one header treatment for every content page
    'page-gutter':
      'w-full max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)]',
    'page-title': 'text-2xl sm:text-3xl font-semibold leading-tight tracking-[-0.01em] text-fg-1 text-balance',
    'page-description': 'text-sm sm:text-base leading-normal text-fg-2 text-pretty max-w-[65ch]',
    // Section heading inside a page or glass panel
    'section-title': 'text-base font-semibold leading-snug text-fg-1',
    'chunks-horizontal-2': 'flex flex-col md:flex-row items-center justify-center gap-2 w-full',
  },
  presets: [
    presetWind({
      important: 'body',
      // The theme is an attribute on <html> set before first paint (src/setup/theme-script.ts), not a .dark class
      dark: { dark: 'html[data-theme="dark"]', light: 'html[data-theme="light"]' },
    }),
    presetUno(),
    presetAnimations(),
    presetTypography(),
  ],
  content: {
    pipeline: {
      include: [
        // the default
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // include js/ts files
        '(components|src)/**/*.{js,ts}',
      ],
    },
  },
})