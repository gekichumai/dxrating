// One maimai NET login with our exact client (undici, TLS settings, headers, cookie handling), for an A/B test of the
// same SEGA account from two networks (gekichumai/meta#32). Run it on the production container and on another machine:
//
//   docker exec -it <backend container> node apps/backend/dist/net-login-probe.js intl
//   pnpm --filter @gekichumai/backend exec tsx src/net-login-probe.ts intl      (from a checkout)
//
// The SEGA ID and password are read from the terminal with echo off. They are never written to a file, an argument,
// an environment variable, Sentry or the output: the output shows only status codes, paths without query strings,
// cookie names (not values) and SEGA's page text with the ID removed (pageSignals).
import { Effect } from 'effect'
import { lookup } from 'node:dns/promises'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { fetch } from 'undici'
import { MaimaiNETIntlClient, MaimaiNETJpClient, NetImportError } from './lib/functions/client'
import { URLS } from './lib/functions/URLS'

type Region = 'intl' | 'jp'

const pathOf = (url: string) => {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}${parsed.search ? '?…' : ''}`
  } catch {
    return '(unparsable location)'
  }
}

const trace = (
  url: string,
  method: string,
  res: { status: number; headers: { get(name: string): string | null; getSetCookie(): string[] } },
) => {
  const location = res.headers.get('location')
  const cookies = res.headers.getSetCookie().map((cookie) => cookie.split('=')[0])
  console.log(
    [
      `  ${method.padEnd(4)} ${pathOf(url)} → ${res.status}`,
      location ? `location=${pathOf(location)}` : '',
      cookies.length ? `set-cookie=${cookies.join(',')}` : '',
      `type=${res.headers.get('content-type') ?? '-'}`,
      `server=${res.headers.get('server') ?? '-'}`,
    ]
      .filter(Boolean)
      .join('  '),
  )
}

class TracedIntlClient extends MaimaiNETIntlClient {
  constructor() {
    super()
    const request = this.requestEffect
    this.requestEffect = (url, init) =>
      request(url, init).pipe(Effect.tap((res) => Effect.sync(() => trace(url, init?.method ?? 'GET', res))))
  }
}

class TracedJpClient extends MaimaiNETJpClient {
  constructor() {
    super()
    const request = this.requestEffect
    this.requestEffect = (url, init) =>
      request(url, init).pipe(Effect.tap((res) => Effect.sync(() => trace(url, init?.method ?? 'GET', res))))
  }
}

/** Reads both answers with echo off through one readline interface, so lines typed ahead are not lost */
async function askHidden(questions: string[]) {
  let muted = false
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk)
      callback()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  try {
    const answers: string[] = []
    for (const question of questions) {
      process.stderr.write(question)
      muted = true
      answers.push(await rl.question(''))
      muted = false
      process.stderr.write('\n')
    }
    return answers
  } finally {
    muted = false
    rl.close()
  }
}

async function network(region: Region) {
  // maimai NET resolves to IPv4 only, so the IPv4 egress is the one SEGA sees
  for (const [family, url] of [
    ['ipv4', 'https://1.1.1.1/cdn-cgi/trace'],
    ['ipv6', 'https://[2606:4700:4700::1111]/cdn-cgi/trace'],
  ]) {
    const trace = await fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((res) => res.text())
      .catch(() => '')
    const field = (name: string) => trace.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '?'
    console.log(`egress ${family}: ${trace ? `ip=${field('ip')} loc=${field('loc')} colo=${field('colo')}` : 'none'}`)
  }
  console.log(`runtime: node ${process.versions.node}, undici ${process.versions.undici ?? '?'}`)
  const hosts =
    region === 'intl'
      ? [new URL(URLS.INTL.LOGIN_PAGE).host, new URL(URLS.INTL.RECORD_RECENT_PAGE).host]
      : ['maimaidx.jp']
  for (const host of hosts) {
    const addresses = await lookup(host, { all: true }).catch(() => [])
    console.log(`dns: ${host} → ${addresses.map((a) => a.address).join(', ') || 'lookup failed'}`)
  }
}

async function main() {
  const region = process.argv[2]
  if (region !== 'intl' && region !== 'jp') {
    console.error('usage: net-login-probe <intl|jp>')
    process.exit(2)
  }
  if (!process.stdin.isTTY) {
    console.error('net-login-probe needs an interactive terminal (docker exec -it)')
    process.exit(2)
  }
  console.log(`maimai NET login probe (${region}) at ${new Date().toISOString()}`)
  await network(region)

  let [id = '', password = ''] = await askHidden(['SEGA ID (hidden): ', 'Password (hidden): '])
  const scrub = (text: string) => (id ? text.split(id).join('[id]') : text).replace(/\?[^\s"]*/g, '?…')

  const client = region === 'intl' ? new TracedIntlClient() : new TracedJpClient()
  console.log('requests:')
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* client.loginEffect({ id, password })
      const recent = yield* client.fetchRecentRecordsEffect()
      return { ok: true as const, recent: recent.length }
    }).pipe(Effect.catch((error: unknown) => Effect.succeed({ ok: false as const, error }))),
  )
  id = ''
  password = ''

  if (result.ok) {
    console.log(`RESULT: success, logged in and read ${result.recent} recent records`)
    return
  }
  const { error } = result
  if (error instanceof NetImportError) {
    console.log(
      `RESULT: ${error.code} step=${error.step ?? '-'} net_error_code=${error.netErrorCode ?? '-'} message=${JSON.stringify(scrub(error.message))} upstream=${JSON.stringify(error.upstreamMessage ?? '-')}`,
    )
  } else {
    const field = (name: string): unknown => (typeof error === 'object' && error ? Reflect.get(error, name) : undefined)
    const cause = field('cause')
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause ?? error)
    console.log(`RESULT: ${String(field('_tag') ?? 'error')} ${String(field('operation') ?? '')} ${scrub(detail)}`)
  }
  process.exitCode = 1
}

await main()