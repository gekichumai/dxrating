import { createTheme, type MantineColorsTuple } from '@mantine/core'

/** DXRating's accent (#178c72, apps/web tokens.css) as a Mantine 10-shade palette; shade 6 is the accent itself */
const dxrating: MantineColorsTuple = [
  '#e6f8f3',
  '#cdeee4',
  '#9ddcc8',
  '#68caaa',
  '#3fba92',
  '#25b083',
  '#178c72',
  '#0f7a62',
  '#066c56',
  '#005c48',
]

/** Modest radii only (AGENTS.md "Design"): sm by default, md at most */
export const adminTheme = createTheme({
  primaryColor: 'dxrating',
  colors: { dxrating },
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'sm',
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '6px', xl: '6px' },
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", "Noto Sans SC", sans-serif',
  headings: { fontWeight: '600' },
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
  },
})