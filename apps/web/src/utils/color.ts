import Color from 'colorjs.io'
import { match } from 'ts-pattern'

export const deriveColor = (color: string, type: 'border' | 'text' | 'overlay') => {
  const c = new Color(color)
  return match(type)
    .with('border', () => {
      c.lch.l = (c.lch.l ?? 0) - 5
      return c.display()
    })
    .with('overlay', () => {
      c.lch.l = (c.lch.l ?? 0) - 20
      c.lch.c = (c.lch.c ?? 0) + 10
      return c.display()
    })
    .with('text', () => {
      if (c.luminance > 0.5) {
        return 'black'
      }
      return 'white'
    })
    .exhaustive()
}