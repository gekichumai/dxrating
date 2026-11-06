// Builds apps/web/src/search-eval/eval-set.json: (query -> expected song ids) cases for the sheet search, each tagged with
// a bucket and a source. Run with `pnpm --filter @gekichumai/search-eval generate`.
//
// Inputs:
// - packages/dxdata/snapshot.json: songs, aliases and sheets (the same catalog the web tests use)
// - SEGA's official song list (https://maimai.sega.jp/data/maimai_songs.json), cached in .cache/: its `title_kana`
//   sort key checks the analyser's readings. The sort key drops dakuten and small kana, so it can only verify a
//   reading, not supply one.
// - POSTHOG_QUERIES (optional): a TSV of aggregated `?q=` strings and hit counts, exported read-only from PostHog. It
//   is not committed. Without it, the real-usage cases already in the eval set are kept as they are.
//
// Everything is deterministic for a given snapshot and official list: sampling uses a fixed seed.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import {
  hasKana,
  hasKanji,
  hasLatin,
  kanaToRomaji,
  officialSortKey,
  toHiragana,
  toKatakana,
  type RomajiStyle,
} from './kana.ts'

const require = createRequire(import.meta.url)
const kuromoji = require('kuromoji') as {
  builder: (options: { dicPath: string }) => {
    build: (callback: (error: Error | null, tokenizer: Tokenizer) => void) => void
  }
}
interface Token {
  surface_form: string
  reading?: string
}
interface Tokenizer {
  tokenize: (text: string) => Token[]
}

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUTPUT = path.join(ROOT, 'apps/web/src/search-eval/eval-set.json')
const CACHE = path.join(import.meta.dirname, '.cache')
const SEED = 20261106
const PER_STRATUM = 70
const ALIAS_SAMPLE = 1500

interface SnapshotSong {
  id: string
  category: string
  title: string
  artist: string
  searchAcronyms: string[]
  sheets: { internalId?: number }[]
}
interface Snapshot {
  updatedAt: string
  songs: SnapshotSong[]
  aliases: { song_id: string; name: string }[]
}
interface OfficialSong {
  title: string
  title_kana: string
  catcode: string
}

export interface EvalCase {
  query: string
  expected: string[]
  /** `<source>/<variant>`, e.g. `synthetic/romaji-hepburn` or `real/latin` */
  bucket: string
  /** The script of the target title (synthetic) or of the query (real) */
  script: Script
  source: 'synthetic' | 'posthog' | 'alias'
  /** For real queries: how often the string was seen; for synthetic ones: the title it came from */
  note?: string
  hits?: number
}

type Script = 'kanji' | 'kana' | 'latin' | 'mixed' | 'symbol' | 'numeric'

// --- helpers -------------------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

const nfkc = (value: string) => value.normalize('NFKC')
/** The oracle's comparison key: NFKC, lowercase, katakana, no spaces or punctuation */
const looseKey = (value: string) =>
  toKatakana(nfkc(value).toLowerCase())
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim()

function scriptOf(value: string): Script {
  const text = nfkc(value)
  if (/^[\d\s.]+$/u.test(text)) return 'numeric'
  // Letters outside latin, kana and CJK (Greek, Cyrillic, ...) or dense symbols make a title hard to type.
  const exotic = [...text].filter(
    (char) =>
      /\p{L}/u.test(char) &&
      !/[A-Za-z]/u.test(char) &&
      !/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(char),
  ).length
  const symbols = [...text].filter((char) => /[\p{S}]/u.test(char) || /[^\p{L}\p{N}\s\p{P}]/u.test(char)).length
  if (exotic > 0 || symbols >= 2) return 'symbol'
  const latin = hasLatin(text)
  const japanese = hasKana(text) || hasKanji(text)
  if (latin && japanese) return 'mixed'
  if (hasKanji(text)) return 'kanji'
  if (hasKana(text)) return 'kana'
  if (latin) return 'latin'
  return 'symbol'
}

const toFullWidth = (value: string) =>
  value.replace(/[!-~]/gu, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0)).replace(/ /gu, '　')

// --- readings ------------------------------------------------------------------------------------------------------

interface Reading {
  /** Per token: the katakana reading, or the surface for latin, digits and kana */
  tokens: { surface: string; reading: string; kanji: boolean; latin: boolean }[]
  katakana: string
  /** The reading's sort key matches SEGA's `title_kana` */
  verified: boolean
}

function readingOf(tokenizer: Tokenizer, title: string, officialKana: string | undefined): Reading | undefined {
  const tokens: Reading['tokens'] = []
  for (const token of tokenizer.tokenize(nfkc(title))) {
    const surface = token.surface_form
    if (!surface.trim()) continue
    if (/^[\p{P}\p{S}]+$/u.test(surface)) continue
    if (hasKanji(surface)) {
      if (!token.reading || token.reading === '*') return undefined
      tokens.push({ surface, reading: token.reading, kanji: true, latin: false })
    } else if (hasKana(surface)) {
      tokens.push({ surface, reading: toKatakana(surface), kanji: false, latin: false })
    } else {
      tokens.push({ surface, reading: surface, kanji: false, latin: hasLatin(surface) })
    }
  }
  if (!tokens.some((token) => token.kanji || hasKana(token.reading))) return undefined
  const katakana = tokens.map((token) => token.reading).join('')
  const verified = officialKana !== undefined && officialSortKey(katakana) === officialSortKey(officialKana)
  return { tokens, katakana, verified }
}

function romajiOf(reading: Reading, style: RomajiStyle, longVowels: 'keep' | 'drop', separator: string) {
  return reading.tokens
    .map((token) => (token.latin ? token.reading.toLowerCase() : kanaToRomaji(token.reading, style, longVowels)))
    .join(separator)
    .replace(/\s+/gu, ' ')
    .trim()
}

// --- load ----------------------------------------------------------------------------------------------------------

async function loadOfficial(): Promise<OfficialSong[]> {
  const file = path.join(CACHE, 'maimai_songs.json')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true })
    const response = await fetch('https://maimai.sega.jp/data/maimai_songs.json')
    if (!response.ok) throw new Error(`official song list: HTTP ${response.status}`)
    fs.writeFileSync(file, await response.text())
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as OfficialSong[]
}

async function loadTokenizer(): Promise<Tokenizer> {
  const dicPath = path.join(path.dirname(require.resolve('kuromoji')), '../dict')
  return new Promise((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((error, tokenizer) => (error ? reject(error) : resolve(tokenizer))),
  )
}

// --- generation ----------------------------------------------------------------------------------------------------

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/dxdata/snapshot.json'), 'utf8')) as Snapshot
  const official = await loadOfficial()
  const tokenizer = await loadTokenizer()
  const random = mulberry32(SEED)

  const officialKanaByTitle = new Map<string, string>()
  for (const song of official) officialKanaByTitle.set(nfkc(song.title), song.title_kana)

  // Utage charts are titled "[宴]..." and searched differently; leave them out of the synthetic set.
  const playable = snapshot.songs.filter((song) => song.category !== '宴会場')
  const songsByTitle = new Map<string, string[]>()
  for (const song of snapshot.songs) {
    const key = nfkc(song.title)
    songsByTitle.set(key, [...(songsByTitle.get(key) ?? []), song.id])
  }

  const readings = new Map<string, Reading | undefined>()
  for (const song of snapshot.songs) {
    readings.set(song.id, readingOf(tokenizer, song.title, officialKanaByTitle.get(nfkc(song.title))))
  }

  const cases: EvalCase[] = []
  const seen = new Set<string>()
  const push = (entry: EvalCase) => {
    const query = entry.query.trim()
    if (!query) return
    const key = `${entry.bucket}\u0000${query}`
    if (seen.has(key)) return
    seen.add(key)
    cases.push({ ...entry, query, expected: [...new Set(entry.expected)].sort() })
  }

  // Synthetic: a stratified sample of titles by script, then every variant that applies to each title.
  const strata = new Map<Script, SnapshotSong[]>()
  for (const song of playable) {
    const script = scriptOf(song.title)
    strata.set(script, [...(strata.get(script) ?? []), song])
  }
  const sampled = [...strata.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, songs]) => shuffled(songs, random).slice(0, PER_STRATUM))

  const allTitleKeys = [...songsByTitle.keys()].map((title) => [title, looseKey(title)] as const)

  for (const song of sampled) {
    const title = nfkc(song.title)
    const expected = songsByTitle.get(title) ?? [song.id]
    const script = scriptOf(title)
    const add = (variant: string, query: string) =>
      push({ query, expected, bucket: `synthetic/${variant}`, script, source: 'synthetic', note: song.title })

    add('exact', song.title)

    // Prefix: the shortest prefix (at least 3 characters, 2 for CJK) that at most 3 titles share
    const chars = [...title]
    const minimum = hasKanji(title) || hasKana(title) ? 2 : 3
    for (let length = minimum; length < chars.length; length++) {
      const prefix = chars.slice(0, length).join('')
      const key = looseKey(prefix)
      if (key.length < minimum) continue
      if (allTitleKeys.filter(([, titleKey]) => titleKey.startsWith(key)).length <= 3) {
        add('prefix', prefix)
        break
      }
    }

    if (hasLatin(title)) {
      add('case-lower', title.toLowerCase())
      add('width-full', toFullWidth(title.toLowerCase()))
      // Initials of the words before any bracketed suffix, e.g. "Ultra Synergy Matrix" -> usm
      const words = title
        .replace(/[(（[【].*$/u, '')
        .split(/[\s\-_/]+/u)
        .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
      if (words.length >= 3 && words.length <= 6 && words.every((word) => /^[A-Za-z]/u.test(word))) {
        add('abbreviation', words.map((word) => word[0]!.toLowerCase()).join(''))
      }
      const letters = title.toLowerCase()
      if (letters.replace(/[^a-z]/gu, '').length >= 6) {
        // Swap two adjacent letters in the middle of the title
        const middle = Math.floor(letters.length / 2)
        let at = middle
        while (at < letters.length - 1 && !/[a-z]{2}/u.test(letters.slice(at, at + 2))) at++
        if (at < letters.length - 1 && letters[at] !== letters[at + 1]) {
          add('typo', letters.slice(0, at) + letters[at + 1] + letters[at] + letters.slice(at + 2))
        }
      }
    }

    const reading = readings.get(song.id)
    if (reading?.verified) {
      const hiragana = toHiragana(reading.katakana)
      const katakana = reading.katakana
      if (hiragana !== title) add('reading-hiragana', hiragana)
      if (katakana !== title) add('reading-katakana', katakana)
      add('romaji-hepburn', romajiOf(reading, 'hepburn', 'keep', ''))
      add('romaji-hepburn-spaced', romajiOf(reading, 'hepburn', 'keep', ' '))
      add('romaji-kunrei', romajiOf(reading, 'kunrei', 'keep', ''))
      add('romaji-short-vowels', romajiOf(reading, 'hepburn', 'drop', ''))
      const firstTokens = romajiOf(reading, 'hepburn', 'drop', ' ').split(' ')
      let prefix = ''
      for (const token of firstTokens) {
        prefix += token
        if (prefix.length >= 5) break
      }
      if (prefix.length >= 4 && prefix !== romajiOf(reading, 'hepburn', 'drop', '')) add('romaji-prefix', prefix)
      const kanaPrefix = [...hiragana].slice(0, Math.max(3, Math.ceil([...hiragana].length / 2))).join('')
      if (kanaPrefix !== hiragana) add('reading-prefix', kanaPrefix)

      // Mixed script: spell the first kanji word in hiragana and keep the rest as written, e.g. まほう仕掛けの夜
      const firstKanji = reading.tokens.findIndex((token) => token.kanji)
      if (firstKanji >= 0 && reading.tokens.filter((token) => token.kanji).length >= 1) {
        const mixed = reading.tokens
          .map((token, index) => (index === firstKanji ? toHiragana(token.reading) : token.surface))
          .join('')
        if (mixed !== hiragana && looseKey(mixed) !== looseKey(title)) add('mixed-script', mixed)
      }
    }
  }

  // Synthetic: artist queries for artists with at most three songs; any of their songs counts as a hit.
  const songsByArtist = new Map<string, string[]>()
  for (const song of playable) {
    const artist = nfkc(song.artist).trim()
    if (artist.length < 3 || artist === '-') continue
    songsByArtist.set(artist, [...(songsByArtist.get(artist) ?? []), song.id])
  }
  const artists = shuffled(
    [...songsByArtist.entries()].filter(([, ids]) => ids.length <= 3).sort(([a], [b]) => a.localeCompare(b)),
    random,
  ).slice(0, 80)
  for (const [artist, ids] of artists) {
    push({ query: artist, expected: ids, bucket: 'synthetic/artist', script: scriptOf(artist), source: 'synthetic' })
  }

  // Alias regression: every community alias (server table) and every generated alias in the catalog
  const aliasTargets = new Map<string, Set<string>>()
  const addAlias = (name: string, songId: string) => {
    const key = nfkc(name).trim()
    if (!key) return
    if (!aliasTargets.has(key)) aliasTargets.set(key, new Set())
    aliasTargets.get(key)!.add(songId)
  }
  for (const alias of snapshot.aliases) addAlias(alias.name, alias.song_id)
  for (const song of snapshot.songs) for (const name of song.searchAcronyms) addAlias(name, song.id)
  // A fixed sample keeps the eval fast; aliases that are a whole title are covered by the exact bucket
  const aliasEntries = [...aliasTargets.entries()]
    .filter(([name]) => !songsByTitle.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
  for (const [name, ids] of shuffled(aliasEntries, random).slice(0, ALIAS_SAMPLE)) {
    push({ query: name, expected: [...ids], bucket: 'alias/exact', script: scriptOf(name), source: 'alias' })
  }

  // Real usage
  const previous = fs.existsSync(OUTPUT)
    ? (JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) as { cases: EvalCase[] }).cases
    : []
  const queriesFile = process.env.POSTHOG_QUERIES
  if (queriesFile) {
    for (const entry of labelRealQueries(fs.readFileSync(queriesFile, 'utf8'), snapshot, readings)) push(entry)
  } else {
    for (const entry of previous.filter((entry) => entry.source === 'posthog')) push(entry)
  }

  cases.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.query.localeCompare(b.query))
  const buckets: Record<string, number> = {}
  for (const entry of cases) buckets[entry.bucket] = (buckets[entry.bucket] ?? 0) + 1
  const verifiedReadings = [...readings.values()].filter((reading) => reading?.verified).length
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(
      {
        snapshotUpdatedAt: snapshot.updatedAt,
        seed: SEED,
        readings: { analyser: 'kuromoji (IPADIC)', titlesWithVerifiedReading: verifiedReadings },
        buckets,
        cases,
      },
      null,
      2,
    )}\n`,
  )
  console.info(`Wrote ${cases.length} cases to ${path.relative(ROOT, OUTPUT)}`)
  console.table(buckets)
}

// --- real queries --------------------------------------------------------------------------------------------------

/**
 * Labels aggregated PostHog queries with an oracle that never runs the search being measured: a query is labelled
 * with a song when the song's title, alias, artist-free reading or romaji contains it and at most three songs do.
 * MANUAL_LABELS covers queries the oracle cannot resolve.
 */
function labelRealQueries(tsv: string, snapshot: Snapshot, readings: Map<string, Reading | undefined>): EvalCase[] {
  const aliasesBySong = new Map<string, string[]>()
  for (const alias of snapshot.aliases) {
    aliasesBySong.set(alias.song_id, [...(aliasesBySong.get(alias.song_id) ?? []), alias.name])
  }
  const keysBySong = snapshot.songs.map((song) => {
    const reading = readings.get(song.id)
    const keys = [song.title, ...song.searchAcronyms, ...(aliasesBySong.get(song.id) ?? [])]
    if (reading) {
      keys.push(
        reading.katakana,
        romajiOf(reading, 'hepburn', 'keep', ''),
        romajiOf(reading, 'hepburn', 'drop', ''),
        romajiOf(reading, 'kunrei', 'keep', ''),
      )
    }
    return { song, keys: [...new Set(keys.map(looseKey).filter(Boolean))] }
  })
  const titleById = new Map(snapshot.songs.map((song) => [song.id, song.title]))
  const idsByTitle = new Map<string, string[]>()
  for (const song of snapshot.songs) idsByTitle.set(song.title, [...(idsByTitle.get(song.title) ?? []), song.id])

  const out: EvalCase[] = []
  for (const line of tsv.split('\n')) {
    const [rawQuery, rawHits] = line.split('\t')
    const query = rawQuery?.trim()
    if (!query) continue
    const hits = Number(rawHits) || 1
    const script = scriptOf(query)
    let expected: string[] | undefined

    const manual = MANUAL_LABELS[query]
    if (manual === null) continue
    if (manual) {
      expected = manual.flatMap((title) => {
        const ids = idsByTitle.get(title)
        if (!ids) throw new Error(`MANUAL_LABELS: no song titled ${title}`)
        return ids
      })
    } else if (script === 'numeric') {
      const id = Number(query)
      const ids = snapshot.songs
        .filter((song) => song.sheets.some((sheet) => sheet.internalId === id))
        .map((song) => song.id)
      if (ids.length) expected = ids
    } else {
      const key = looseKey(query)
      const minimum = hasKanji(query) || hasKana(query) ? 2 : 3
      if (key.length < minimum) continue
      // People type from the start of a name, so the first tier that matches wins: the whole key, a key prefix,
      // then anywhere in the key.
      const tiers = [(k: string) => k === key, (k: string) => k.startsWith(key), (k: string) => k.includes(key)]
      for (const matches of tiers) {
        const found = keysBySong.filter(({ keys }) => keys.some(matches))
        if (!found.length) continue
        // Different charts of one title (DX/STD songs share a title) count as one target
        const titles = new Set(found.map(({ song }) => song.title))
        if (titles.size <= 3) expected = found.map(({ song }) => song.id)
        break
      }
    }
    if (!expected?.length) continue
    out.push({
      query,
      expected,
      // The query script cannot tell Chinese from Japanese kanji, so CJK covers both
      bucket: `real/${script === 'symbol' ? 'mixed' : script === 'kanji' ? 'cjk' : script}`,
      script,
      source: 'posthog',
      hits,
      note: [...new Set(expected.map((id) => titleById.get(id)))].join(' | '),
    })
  }
  return out
}

/**
 * Hand labels for real queries the oracle cannot resolve (romaji of titles the analyser reads wrong, nicknames the
 * alias tables do not have yet). `null` drops a query the oracle would mislabel.
 */
const MANUAL_LABELS: Record<string, string[] | null> = {
  // Typos and misspellings
  sotria: ['ソテリア'],
  'konon remix': ['ここからはじまるプロローグ。 (Kanon Remix)'],
  flameforst: ['FLΛME/FRΦST'],
  systhesis: ['Synthesis.'],
  swarzc: ['Schwarzschild'],
  swarzh: ['Schwarzschild'],
  slientblue: ['SILENT BLUE'],
  'super ambulence': ['SUPER AMBULANCE'],
  'jeta est': ['Alea jacta est!'],
  oborous: ['ouroboros -twin stroke of the end-'],
  birtus: ['ViRTUS'],
  divede: ['Divide et impera!'],
  fallling: ['Falling', 'Falling Roses'],
  // Traditional or simplified Chinese forms of a Japanese title
  惡戲センセーツョン: ['悪戯センセーション'],
  二代目阎魔: ['2代目閻魔'],
  // A title with extra words after it
  'ケロ⑨destiny 1': ['ケロ⑨destiny'],
  'シリウスの輝きのように でらっく': ['シリウスの輝きのように'],
  // A number that is part of a title, not a music ID
  '8759632145': ['このピアノでお前を8759632145回ぶん殴る'],
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})