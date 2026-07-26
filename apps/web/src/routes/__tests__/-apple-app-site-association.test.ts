import { describe, expect, it } from 'vitest'
import { buildAppleAppSiteAssociation } from '../[.]well-known/apple-app-site-association'

describe('buildAppleAppSiteAssociation', () => {
  it('associates the native app with every web route it can open', () => {
    const association = JSON.parse(buildAppleAppSiteAssociation())

    expect(association).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: 'F25GFFJL49.net.dxrating.ios',
            paths: [
              '/songs/*',
              '/charts/recent',
              '/charts/trending',
              '/search',
              '/rating',
              '/account',
              '/privacy-policy',
              '/io/import/lxns/oauth_callback',
              '/*/std/*',
              '/*/dx/*',
              '/*/utage/*',
            ],
          },
        ],
      },
      webcredentials: {
        apps: ['F25GFFJL49.net.dxrating.ios'],
      },
    })
  })

  it('does not claim unrelated paths on dxrating.net', () => {
    const association = JSON.parse(buildAppleAppSiteAssociation())
    const paths = association.applinks.details[0].paths

    expect(paths).not.toContain('*')
    expect(paths).not.toContain('/*')
  })
})