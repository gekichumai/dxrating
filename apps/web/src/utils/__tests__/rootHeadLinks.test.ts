import { describe, expect, it } from 'vitest'
import { buildRootHeadLinks } from '../rootHeadLinks'

describe('buildRootHeadLinks', () => {
  it('keeps React-managed stylesheets same-origin', () => {
    const links = buildRootHeadLinks({ pathname: '/search', search: { q: '宴' } })
    const stylesheetLinks = links.filter((link) => link.rel === 'stylesheet')

    // App CSS ships through the route manifest; any stylesheet linked here must stay same-origin
    for (const link of stylesheetLinks) expect(link.href).not.toMatch(/^https?:\/\//)
    expect(links).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ href: expect.stringContaining('fonts.googleapis.com') })]),
    )
  })

  it('retains the current-route alternate and canonical links without search params', () => {
    const links = buildRootHeadLinks({ pathname: '/rating', search: { q: '宴', locale: 'ja' } })

    expect(links).toContainEqual({ rel: 'alternate', hrefLang: 'ja', href: 'https://dxrating.net/rating?locale=ja' })
    expect(links.filter((link) => link.rel === 'canonical')).toEqual([
      { rel: 'canonical', href: 'https://dxrating.net/rating?locale=ja' },
    ])
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