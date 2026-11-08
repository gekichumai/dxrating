/**
 * Synthetic upstreams of the server import tests: a fake maimai NET (JP and intl) behind the undici `fetch` of the NET
 * client, and request routers for LXNS and Diving-Fish behind the global `fetch` of the Effect HTTP client. Nothing
 * here is recorded from a real account; the HTML follows the selectors of the parsers (`parseMusicRecordNode`,
 * `parseFriendCode`). The friend code page in particular is synthetic and must be checked against real JP and intl
 * accounts by the owner (design §16.4).
 */
import { URLS } from '../lib/functions/URLS'
import { authenticatedFetch, getBaseUrl } from './setup'

/** Charts of the bundled catalog snapshot whose title, type and difficulty name one sheet */
export const CHARTS = {
  kiminoDxMaster: {
    title: '君の知らない物語',
    type: 'dx',
    difficulty: 'master',
    sheetId: 'dsht_e5nsvt8k2a',
    internalId: 10181,
  },
  kiminoDxExpert: {
    title: '君の知らない物語',
    type: 'dx',
    difficulty: 'expert',
    sheetId: 'dsht_rc6qf899yy',
    internalId: 10181,
  },
  kiminoStdMaster: {
    title: '君の知らない物語',
    type: 'std',
    difficulty: 'master',
    sheetId: 'dsht_36ncrs5g4j',
    internalId: 181,
  },
  ourFightingStdBasic: {
    title: 'Our Fighting',
    type: 'std',
    difficulty: 'basic',
    sheetId: 'dsht_jj8s52dvfn',
    internalId: 293,
  },
} as const

export type Chart = (typeof CHARTS)[keyof typeof CHARTS]

export interface NetRecord {
  /** Title as maimai NET shows it; a title the catalog does not know is skipped */
  title: string
  type: 'dx' | 'std'
  difficulty: 'basic' | 'advanced' | 'expert' | 'master' | 'remaster'
  /** As maimai NET shows it, e.g. `100.5000%` */
  rate: string
  dxScore?: string
  flags?: string[]
}

const DIFFICULTY_INDEX = { basic: 0, advanced: 1, expert: 2, master: 3, remaster: 4 } as const

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function netRecord(chart: Chart, rate: string, flags: string[] = []): NetRecord {
  return { title: chart.title, type: chart.type, difficulty: chart.difficulty, rate, flags }
}

/** A music record page with the given records, as the parser reads it */
export function musicPageHtml(records: NetRecord[]): string {
  const blocks = records.map(
    (record) => `<div class="w_450 m_15 p_r f_0">
  <img class="h_20 f_l" src="https://maimaidx.jp/maimai-mobile/img/diff_${record.difficulty}.png" />
  <img class="music_kind_icon" src="https://maimaidx.jp/maimai-mobile/img/music_${record.type === 'dx' ? 'dx' : 'standard'}.png" />
  <div class="music_name_block">${escapeHtml(record.title)}</div>
  <div class="music_score_block w_112">${record.rate}</div>
  <div class="music_score_block w_190">${record.dxScore ?? '1,234 / 2,000'}</div>
  <form>${(record.flags ?? []).map((flag) => `<img class="f_r" src="https://maimaidx.jp/maimai-mobile/img/music_icon_${flag}.png" />`).join('')}</form>
</div>`,
  )
  return `<html><head><title>maimai DX NET</title></head><body><div class="wrapper">${blocks.join('\n')}</div></body></html>`
}

/** The friend code page (synthetic: the real page must be confirmed, design §16.4) */
export function friendCodePageHtml(code: string): string {
  return `<html><body><div class="wrapper">
  <div class="basic_block p_10 f_0"><div class="name_block f_l f_16">ＳＹＮＴＨ</div></div>
  <div class="see_through_block m_t_5 m_b_5 p_5 t_c f_15">${code}</div>
  <div class="f_12">フレンドコードを教えて、フレンドになろう！</div>
</div></body></html>`
}

export interface FakeNetOptions {
  id: string
  password: string
  /** `null`: the friend code page answers 404 */
  friendCode?: string | null
  records?: NetRecord[]
  /** Difficulty index (0-4, 10) whose page always redirects to the error page */
  failDifficulty?: number
  /** Resolves before the first music page is answered (to hold a job running) */
  gate?: Promise<void>
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })

const formOf = (init: RequestInit | undefined) => new URLSearchParams(String(init?.body ?? ''))

/**
 * A fake maimai NET for both regions. Wrong credentials: JP redirects the login to its error page; intl redirects
 * to the Aime login page, which shows an error that echoes the SEGA ID and password (adversarial: nothing may
 * repeat it).
 */
export function createFakeNet(options: FakeNetOptions) {
  const calls: string[] = []
  const records = options.records ?? []
  const page = (url: URL) => {
    const diff = Number(url.searchParams.get('diff'))
    if (diff === options.failDifficulty) return redirect(URLS.CHECKLIST.ERROR[1]!)
    return html(musicPageHtml(records.filter((record) => DIFFICULTY_INDEX[record.difficulty] === diff)))
  }
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    calls.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`)
    const href = url.href
    // JP
    if (href === URLS.JP.LOGIN_PAGE) {
      return html('<form><input type="hidden" name="token" value="synthetic-token" /></form>')
    }
    if (href === URLS.JP.LOGIN_ENDPOINT) {
      const form = formOf(init)
      return form.get('segaId') === options.id && form.get('password') === options.password
        ? redirect(URLS.JP.LOGIN_AIMELIST)
        : redirect(URLS.CHECKLIST.ERROR[1]!)
    }
    if (([URLS.JP.LOGIN_AIMELIST, URLS.JP.LOGIN_AIMELIST_SUBMIT, URLS.JP.HOMEPAGE] as string[]).includes(href))
      return html('')
    // intl
    if (href === URLS.INTL.LOGIN_PAGE) return html('')
    if (href === URLS.INTL.LOGIN_ENDPOINT) {
      const form = formOf(init)
      return form.get('sid') === options.id && form.get('password') === options.password
        ? redirect('https://maimaidx-eng.com/maimai-mobile/?ssid=synthetic')
        : redirect('https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&error=1')
    }
    if (href.startsWith('https://lng-tgk-aime-gw.am-all.net/common_auth/login')) {
      return html(
        `<div id="error">The SEGA ID ${escapeHtml(options.id)} or the password ${escapeHtml(options.password)} is incorrect.</div>`,
      )
    }
    if (href === 'https://maimaidx-eng.com/maimai-mobile/?ssid=synthetic') return html('<div>home</div>')
    // both
    if (href === URLS.JP.FRIEND_CODE_PAGE || href === URLS.INTL.FRIEND_CODE_PAGE) {
      return options.friendCode === null || options.friendCode === undefined
        ? html('not found', 404)
        : html(friendCodePageHtml(options.friendCode))
    }
    if (href.startsWith(URLS.JP.RECORD_MUSICS_PAGE) || href.startsWith(URLS.INTL.RECORD_MUSICS_PAGE)) {
      await options.gate
      return page(url)
    }
    if (href === URLS.JP.RECORD_RECENT_PAGE || href === URLS.INTL.RECORD_RECENT_PAGE) return html(musicPageHtml([]))
    throw new Error(`Unexpected maimai NET request ${href}`)
  }
  return { fetch, calls }
}

// --- SSE ---

export interface SseEvent {
  event: string
  data: any
}

export function parseSse(text: string): SseEvent[] {
  return text
    .trim()
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n')
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message'
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
      return { event, data: data ? JSON.parse(data) : null }
    })
}

/** Posts a NET import; the parsed events when the answer is a stream, the JSON otherwise */
export async function postNetImport(
  cookie: string,
  saveId: string,
  body: Record<string, unknown>,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
  const response = await authenticatedFetch(`${getBaseUrl()}/api/v1/saves/${saveId}/imports/maimai-net`, cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  const text = await response.text()
  const stream = response.headers.get('content-type')?.includes('text/event-stream') ?? false
  return {
    status: response.status,
    headers: response.headers,
    text,
    events: stream ? parseSse(text) : [],
    json: stream ? null : text ? JSON.parse(text) : null,
  }
}

// --- LXNS and Diving-Fish ---

export const lxnsEnvelope = (data: unknown) => Response.json({ success: true, code: 200, data })

export function lxnsScore(chart: Chart, achievements: number, extra: Record<string, unknown> = {}) {
  return {
    id: chart.internalId % 10000,
    song_name: chart.title,
    level: '12',
    level_index: { basic: 0, advanced: 1, expert: 2, master: 3 }[chart.difficulty],
    achievements,
    fc: null,
    fs: null,
    type: chart.type === 'dx' ? 'dx' : 'standard',
    dx_score: 1500,
    ...extra,
  }
}

export function divingFishChart(chart: Chart, achievements: number) {
  return {
    achievements,
    ds: 12.5,
    dxScore: 1500,
    fc: '',
    fs: '',
    level: '12',
    level_index: { basic: 0, advanced: 1, expert: 2, master: 3 }[chart.difficulty],
    level_label: 'Master',
    ra: 280,
    rate: 'sssp',
    song_id: chart.internalId,
    title: chart.title,
    type: chart.type === 'dx' ? 'DX' : 'SD',
  }
}