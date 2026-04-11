import Color from 'colorjs.io'
import { match } from 'ts-pattern'

export const deriveColor = (color: string, type: 'border' | 'text' | 'overlay') => {
  const c = new Color(color)
  return match(type)
    .with('border', () => {
      c.set('lch.l', (l) => l - 5)
      return c.display()
    })
    .with('overlay', () => {
      c.set('lch.l', (l) => l - 20)
      c.set('lch.c', (cv) => cv + 10)
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