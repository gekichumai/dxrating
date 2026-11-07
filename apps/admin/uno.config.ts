import presetWind from '@unocss/preset-wind'
import { defineConfig } from 'unocss'

// The same utility vocabulary as apps/web (UnoCSS, Tailwind-compatible). Surfaces are translucent and corner radii
// stay modest (AGENTS.md "Design").
export default defineConfig({
  presets: [presetWind({ dark: 'media' })],
  shortcuts: {
    surface:
      'rounded-lg border border-black/8 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-white/6 shadow-sm',
    'text-muted': 'text-zinc-600 dark:text-zinc-400',
  },
})