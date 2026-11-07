import { describe, expect, it } from 'vitest'
import worker from './index'
import { queryFromHost, queryFromPath, targetUrl } from './redirect'

const ZONE = 'xn--6iq3kq43dxve.com'
const HOME = 'https://dxrating.net/?locale=zh-Hans&ref=shenmegequ'
const search = (q: string) => `https://dxrating.net/?q=${encodeURIComponent(q)}&locale=zh-Hans&ref=shenmegequ`

/** The label as a browser sends it in the Host header */
const punycodeLabel = (label: string) => new URL(`https://${label}.example`).hostname.split('.')[0]

function get(url: string) {
  const response = worker.fetch(new Request(url))
  return { status: response.status, location: response.headers.get('Location') }
}

describe('targetUrl', () => {
  it('builds the search URL with the Chinese locale and the ref tag', () => {
    expect(targetUrl('一号店')).toBe(
      'https://dxrating.net/?q=%E4%B8%80%E5%8F%B7%E5%BA%97&locale=zh-Hans&ref=shenmegequ',
    )
  })
  it('encodes spaces as %20 and escapes & and =', () => {
    expect(targetUrl('a b&c=d')).toBe('https://dxrating.net/?q=a%20b%26c%3Dd&locale=zh-Hans&ref=shenmegequ')
  })
  it('drops q for home', () => {
    expect(targetUrl(null)).toBe(HOME)
  })
})

describe('subdomain form', () => {
  it('decodes a CJK label (一号店)', () => {
    expect(get(`https://xn--4gq48lf9j.${ZONE}/`).location).toBe(search('一号店'))
  })
  it('decodes kana', () => {
    expect(queryFromHost(`${punycodeLabel('ばかみたい')}.${ZONE}`)).toBe('ばかみたい')
    expect(queryFromHost(`${punycodeLabel('ヒバナ')}.${ZONE}`)).toBe('ヒバナ')
  })
  it('lowercases a mixed-case host', () => {
    expect(queryFromHost(`Big-Daddy.XN--6IQ3KQ43DXVE.COM`)).toBe('big daddy')
  })
  it('turns hyphens back into spaces and collapses runs', () => {
    expect(queryFromHost(`the--world-is-mine.${ZONE}`)).toBe('the world is mine')
    expect(get(`https://air-hop.${ZONE}/`).location).toBe(search('air hop'))
  })
  it('decodes a label that mixes ASCII and CJK', () => {
    expect(queryFromHost(`${punycodeLabel('初音ミク-sky')}.${ZONE}`)).toBe('初音ミク sky')
  })
  it('joins the labels of a multi-level host with spaces', () => {
    expect(queryFromHost(`a.b.${ZONE}`)).toBe('a b')
  })
  it('ignores the query string and a trailing dot on the host', () => {
    expect(get(`https://xn--4gq48lf9j.${ZONE}./?utm=1`).location).toBe(search('一号店'))
  })
  it('sends www home', () => {
    expect(get(`https://www.${ZONE}/`).location).toBe(HOME)
  })
})

describe('path form', () => {
  it('decodes the path and keeps case, spaces and dots', () => {
    expect(get(`https://${ZONE}/${encodeURIComponent('Big Daddy feat. 初音ミク')}`).location).toBe(
      search('Big Daddy feat. 初音ミク'),
    )
  })
  it('keeps hyphens as typed', () => {
    expect(queryFromPath('/re-education')).toBe('re-education')
  })
  it('is preferred over the subdomain', () => {
    expect(get(`https://xn--4gq48lf9j.${ZONE}/${encodeURIComponent('二号店')}`).location).toBe(search('二号店'))
  })
  it('keeps a slash inside the alias and drops the trailing one', () => {
    expect(queryFromPath('/AC%2FDC/')).toBe('AC/DC')
    expect(queryFromPath('/a/b')).toBe('a/b')
  })
  it('caps very long queries', () => {
    expect(queryFromPath(`/${'あ'.repeat(500)}`)).toHaveLength(200)
  })
})

describe('apex and malformed input', () => {
  it('sends the bare apex home', () => {
    expect(get(`https://${ZONE}/`)).toEqual({ status: 302, location: HOME })
    expect(get(`https://${ZONE}`).location).toBe(HOME)
  })
  it('sends a malformed percent-encoding home', () => {
    expect(get(`https://${ZONE}/%E0%A4%A`).location).toBe(HOME)
    expect(get(`https://xn--4gq48lf9j.${ZONE}/%ZZ`).location).toBe(HOME)
  })
  it('sends a whitespace-only path home', () => {
    expect(get(`https://${ZONE}/%20%20`).location).toBe(HOME)
  })
  it('sends invalid punycode home', () => {
    expect(queryFromHost(`xn--zz.${ZONE}`)).toBeNull()
  })
  it('sends a host outside the zone home', () => {
    expect(queryFromHost('example.com')).toBeNull()
    expect(queryFromHost(`evil${ZONE}`)).toBeNull()
  })
  it('sends a label of only hyphens home', () => {
    expect(queryFromHost(`---.${ZONE}`)).toBeNull()
  })
  it('answers favicon and robots requests with 404, not a search', () => {
    expect(get(`https://${ZONE}/favicon.ico`).status).toBe(404)
    expect(get(`https://xn--4gq48lf9j.${ZONE}/robots.txt`).status).toBe(404)
  })
  it('caches the redirect for five minutes', () => {
    const response = worker.fetch(new Request(`https://xn--4gq48lf9j.${ZONE}/`))
    expect(response.status).toBe(302)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
  })
})

describe('Host header', () => {
  it('reads the alias from the Host header, port stripped', () => {
    const request = new Request('http://127.0.0.1:8787/', { headers: { Host: `xn--4gq48lf9j.${ZONE}:443` } })
    expect(worker.fetch(request).headers.get('Location')).toBe(search('一号店'))
  })
})
/**
 * The label builder web (#587) and iOS use for `<label>.是什么歌.com`, copied here so the decode side is tested against
 * its real output: NFKC, trim, lowercase; whitespace and dot runs → `-`; keep letters, numbers, marks and `-`;
 * drop variation selectors and any combining mark at the start or after a `-`; collapse and trim `-`; give up when empty or over 63 bytes once punycoded.
 */
function encodeLabel(alias: string): string | null {
  const label = alias
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s.。．｡]+/gu, '-')
    .replace(/[^\p{L}\p{N}\p{M}-]/gu, '')
    .replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '')
    .replace(/(^|-)\p{M}+/gu, '$1')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (label === '' || punycodeLabel(label).length > 63) return null
  return label
}

describe('labels built by web and iOS', () => {
  it.each([
    ['Mr. Wonderland', 'mr-wonderland', 'mr wonderland'],
    ['我的 歌（DX）', '我的-歌dx', '我的 歌dx'],
    ['what?! song...', 'what-song', 'what song'],
    ['一号店', '一号店', '一号店'],
    ['ヒバナ', 'ヒバナ', 'ヒバナ'],
    ['Ｂｉｇ　Ｄａｄｄｙ', 'big-daddy', 'big daddy'],
    ['❤️love', 'love', 'love'],
    ['a ﾟb', 'a-b', 'a b'],
  ])('%s → %s → %s', (alias, label, query) => {
    expect(encodeLabel(alias)).toBe(label)
    const host = `${punycodeLabel(label)}.${ZONE}`
    expect(get(`https://${host}/`).location).toBe(search(query))
  })
})