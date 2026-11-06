/**
 * Adaptive colour scales for dark mode.
 *
 * UnoCSS colour utilities (`text-zinc-500`, `bg-amber-100`, `border-slate-200/70`, …) resolve to CSS variables instead
 * of literal colours. In light mode the variables hold the stock values, so nothing changes; under
 * `html[data-theme="dark"]` they hold the step from the other end of the same scale, so a pale fill becomes a deep
 * one and dark text becomes light text without touching any call site. uno.config.ts wires the theme colours and the
 * preflight; see also the `dark:` variant there for the cases a mirrored step does not cover.
 *
 * - Neutral scales (zinc, slate, gray, neutral, stone) mirror end to end. Mid steps are pulled lighter in dark so the
 *   secondary-text steps (500, 600) stay at or above 4.5:1 on dark glass.
 * - Chromatic scales mirror only their pale and deep ends (50–300 ↔ 950–700). 400 and 500 stay, because saturated
 *   fills carrying white text (`bg-red-500 text-white`) must keep their contrast; 600 lifts to 400 for text on glass.
 * - White and black are not remapped here (white text on accent fills stays white). Surface uses of white and black
 *   are handled by the `postprocess` in uno.config.ts.
 */
import { theme } from '@unocss/preset-mini'

const NEUTRAL_SCALES = ['zinc', 'slate', 'gray', 'neutral', 'stone'] as const
const CHROMATIC_SCALES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const

const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const
type Step = (typeof STEPS)[number]

/** The light step whose value a step takes in dark mode; a pair means the midpoint of the two */
const NEUTRAL_DARK: Record<Step, Step | [Step, Step]> = {
  '50': '950',
  '100': '900',
  '200': '800',
  '300': '700',
  '400': '500',
  '500': '400',
  '600': ['300', '400'],
  '700': '300',
  '800': '200',
  '900': '100',
  '950': '50',
}

const CHROMATIC_DARK: Record<Step, Step> = {
  '50': '950',
  '100': '900',
  '200': '800',
  '300': '700',
  '400': '400',
  '500': '500',
  '600': '400',
  '700': '300',
  '800': '200',
  '900': '100',
  '950': '50',
}

type Scale = Record<string, string>
const stockColors = theme.colors as unknown as Record<string, Scale>

function hexToChannels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

const channels = (rgb: [number, number, number]) => rgb.join(' ')

function resolveDark(scale: Scale, target: Step | [Step, Step]): [number, number, number] {
  if (typeof target === 'string') return hexToChannels(scale[target])
  const [a, b] = target.map((step) => hexToChannels(scale[step]))
  return a.map((v, i) => Math.round((v + b[i]) / 2)) as [number, number, number]
}

const ADAPTIVE_SCALES = [
  ...NEUTRAL_SCALES.map((name) => ({ name, map: NEUTRAL_DARK as Record<Step, Step | [Step, Step]> })),
  ...CHROMATIC_SCALES.map((name) => ({ name, map: CHROMATIC_DARK as Record<Step, Step | [Step, Step]> })),
]

const cssVar = (name: string, step: Step) => `--c-${name}-${step}`

/** Theme colours for uno.config.ts: every step of every adaptive scale, including the 1–9 and DEFAULT aliases */
export function adaptiveThemeColors(): Record<string, Scale> {
  const colors: Record<string, Scale> = {}
  for (const { name } of ADAPTIVE_SCALES) {
    const stock = stockColors[name]
    const scale: Scale = {}
    for (const [key, value] of Object.entries(stock)) {
      const step = (STEPS as readonly string[]).includes(key)
        ? (key as Step)
        : key === 'DEFAULT'
          ? (Object.entries(stock).find(([k, v]) => v === value && (STEPS as readonly string[]).includes(k))?.[0] as
              | Step
              | undefined)
          : (`${key}00` as Step)
      scale[key] =
        step && (STEPS as readonly string[]).includes(step) ? `rgb(var(${cssVar(name, step)}) / %alpha)` : value
    }
    colors[name] = scale
  }
  return colors
}

/** The variables behind adaptiveThemeColors(): stock values on :root, mirrored values under the dark theme */
export function adaptivePaletteCss(): string {
  const light: string[] = []
  const dark: string[] = []
  for (const { name, map } of ADAPTIVE_SCALES) {
    const stock = stockColors[name]
    for (const step of STEPS) {
      light.push(`${cssVar(name, step)}:${channels(hexToChannels(stock[step]))};`)
      dark.push(`${cssVar(name, step)}:${channels(resolveDark(stock, map[step]))};`)
    }
  }
  return `:root{${light.join('')}}html[data-theme="dark"]{${dark.join('')}}`
}