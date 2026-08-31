import { describe, expect, it } from 'vitest'
import { buildRootHeadLinks } from '../rootHeadLinks'

describe('buildRootHeadLinks', () => {
  it('keeps React-managed stylesheets same-origin', () => {
    const links = buildRootHeadLinks({ pathname: '/search', search: { q: '宴' } })
    const stylesheetLinks = links.filter((link) => link.rel === 'stylesheet')

    expect(stylesheetLinks).toHaveLength(1)
    expect(stylesheetLinks[0]?.href).not.toMatch(/^https?:\/\//)
    expect(links).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ href: expect.stringContaining('fonts.googleapis.com') })]),
    )
  })

  it('retains the current-route alternate links', () => {
    const links = buildRootHeadLinks({ pathname: '/search', search: { q: '宴' } })

    expect(links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'ja',
      href: 'https://dxrating.net/search?q=%E5%AE%B4&locale=ja',
    })
  })

  it('publishes API and agent discovery relations in the final document head', () => {
    const links = buildRootHeadLinks({ pathname: '/search' })

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: 'api-catalog', href: '/.well-known/api-catalog' }),
        expect.objectContaining({ rel: 'service-desc', href: 'https://miruku.dxrating.net/spec.json' }),
        expect.objectContaining({ rel: 'service-doc', href: '/developers' }),
        expect.objectContaining({ rel: 'describedby', href: '/llms.txt', type: 'text/markdown' }),
      ]),
    )
  })
})