import process from 'node:process'

import { type DifficultyEnum, type Sheet, TypeEnum, type VersionEnum } from '@gekichumai/dxdata'
import 'dotenv/config'
import he from 'he'
import { flatten, uniq } from 'lodash'
import fs from 'node:fs/promises'
import pg from 'pg'
import type { DXDataOriginal } from './original'

// from https://github.com/zetaraku/arcade-songs-fetch/blob/362f2a1b1a1752074951006cedde06948fb0061a/src/maimai/fetch-intl-versions.ts#L16
const VERSION_ID_MAP = new Map([
  ['maimai', 0],
  ['maimai PLUS', 1],
  ['GreeN', 2],
  ['GreeN PLUS', 3],
  ['ORANGE', 4],
  ['ORANGE PLUS', 5],
  ['PiNK', 6],
  ['PiNK PLUS', 7],
  ['MURASAKi', 8],
  ['MURASAKi PLUS', 9],
  ['MiLK', 10],
  ['MiLK PLUS', 11],
  ['FiNALE', 12],
  ['maimaiでらっくす', 13],
  ['maimaiでらっくす PLUS', 14],
  ['Splash', 15],
  ['Splash PLUS', 16],
  ['UNiVERSE', 17],
  ['UNiVERSE PLUS', 18],
  ['FESTiVAL', 19],
  ['FESTiVAL PLUS', 20],
  ['BUDDiES', 21],
  ['BUDDiES PLUS', 22],
  //! add further version here !//
])

const isMaimaiSeries = (version: string) => {
  const versionId = VERSION_ID_MAP.get(version)
  return versionId !== undefined && versionId <= 12 // 12 is the id of FiNALE
}

async function readAliases1() {
  const aliases = await (
    await fetch('https://raw.githubusercontent.com/lomotos10/GCM-bot/main/data/aliases/en/chuni.tsv')
  ).text()
  const lines = aliases.split('\n')
  const aliasesMap = new Map<string, string[]>()
  for (const line of lines) {
    const segments = line.split('\t')
    aliasesMap.set(segments[0], segments.slice(1))
  }
  return aliasesMap
}

async function readAliases2() {
  const res = await fetch('https://api.yuzuchan.moe/maimaidx/maimaidxalias')
  if (!res.ok || res.status !== 200 || res.headers.get('Content-Type') !== 'application/json') {
    console.warn('Failed to fetch maimaidxalias, skipping')
    return new Map<string, string[]>()
  }
  const aliases = (await res.json()).content
  const aliasesMap = new Map<string, string[]>()
  const aliasesObj = aliases as Record<string, { Name: string; Alias: string[] }>
  for (const [, value] of Object.entries(aliasesObj)) {
    const cleanedAliases = value.Alias.map((alias) => he.decode(alias))
    aliasesMap.set(value.Name, cleanedAliases)
  }
  return aliasesMap
}

async function readAliases3() {
  const aliases = JSON.parse(await fs.readFile('./aliases3.json', 'utf-8'))
  const aliasesMap = new Map<string, string[]>()
  const aliasesObj = aliases as Record<string, string[]>
  for (const [key, value] of Object.entries(aliasesObj)) {
    aliasesMap.set(key, value)
  }
  return aliasesMap
}

async function readAliases4() {
  const res = await fetch('https://maimai.lxns.net/api/v0/maimai/alias/list')
  if (!res.ok || res.status !== 200 || res.headers.get('Content-Type') !== 'application/json') {
    console.warn('Failed to fetch maimai.lxns.net, skipping')
    return new Map<string, string[]>()
  }
  const aliases = (await res.json()) as {
    aliases: { song_id: string; aliases: string[] }[]
  }
  const aliasesMap = new Map<string, string[]>()

  for (const { song_id, aliases: songAliases } of aliases.aliases) {
    aliasesMap.set(song_id, songAliases)
  }
  return aliasesMap
}

let ALIAS_NAME_MAP: Map<string, string[]>
let ALIAS_ID_MAP: Map<string, string[]>
const ALIAS_NAME_EXTRA_MAP: Record<string, string[]> = {
  Hainuwele: ['华为', '华为完了'],
  'ULTRA SYNERGY MATRIX': ['USM', '我来出勤了'],
  神っぽいな: ['像神一样'],
  'Straight into the lights': ['中出光', '直入光'],
  系ぎて: ['白丝', 'ysk泡温泉', '俩舞神越级'],
}

async function getSearchAcronyms(title: string, id?: number) {
  const searchAcronyms = []

  const alias1 = ALIAS_NAME_MAP.get(title)
  if (alias1) {
    searchAcronyms.push(...alias1)
  }

  if (id) {
    const alias2 = ALIAS_ID_MAP.get(id.toString())
    if (alias2) {
      searchAcronyms.push(...alias2)
    }
  }

  if (ALIAS_NAME_EXTRA_MAP[title]) {
    searchAcronyms.push(...ALIAS_NAME_EXTRA_MAP[title])
  }

  // remove zero-width space like characters

  const filtered = uniq(searchAcronyms.map((acronym) => acronym.replace(/\u200B/g, ''))).filter(
    (acronym) => !!acronym && acronym.toLowerCase() !== title.toLowerCase(),
  )
  return filtered
}

export interface MultiverInternalLevelValue {
  songId: string
  type: string
  difficulty: string
  internalLevel: string
  version: string
}

export interface SheetExtras {
  songId: string
  type: string
  difficulty: string
  releaseDate?: Date
}

async function getAllMultiverInternalLevelValues() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, skipping getAllMultiverInternalLevelValues')
    return []
  }

  const conn = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  })
  await conn.connect()

  const { rows } = await conn.query<MultiverInternalLevelValue>(
    `SELECT * FROM "public"."SheetInternalLevels" ORDER BY "songId","type","difficulty","version";`,
  )
  await conn.end()

  return rows
}

async function getAllSheetSpecificReleaseDates() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, skipping getAllSheetSpecificReleaseDates')
    return []
  }

  const conn = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  })
  await conn.connect()

  const { rows } = await conn.query<SheetExtras>(
    `SELECT "songId", "type", "difficulty", "releaseDate" FROM "public"."SheetExtras" WHERE "releaseDate" IS NOT NULL`,
  )
  await conn.end()

  return rows.map((row) => ({
    ...row,
    releaseDate: row.releaseDate?.toISOString().split('T')[0],
  }))
}

export interface MaimaiOfficialSongs {
  artist: string
  catcode:
    | 'maimai'
    | 'POPS＆アニメ'
    | 'ゲーム＆バラエティ'
    | 'niconico＆ボーカロイド'
    | '東方Project'
    | 'オンゲキ＆CHUNITHM'
    | '宴会場'
  image_url: string
  release: string
  lev_bas?: string
  lev_adv?: string
  lev_exp?: string
  lev_mas?: string
  sort: string
  title: string
  title_kana: string
  version: string
  lev_remas?: string
  dx_lev_bas?: string
  dx_lev_adv?: string
  dx_lev_exp?: string
  dx_lev_mas?: string
  date?: string
  dx_lev_remas?: string
  key?: '○'
  lev_utage?: string
  kanji?: string
  comment?: string
  buddy?: '○'
}

function checkSongsInternalId(
  songs: {
    songId: string
    sheets: {
      version: VersionEnum
      internalId?: number
      difficulty: DifficultyEnum
      type: TypeEnum
    }[]
  }[],
) {
  const songsWithMissingInternalIdSheets = songs
    .map((song) => ({
      ...song,
      sheets: song.sheets.filter((sheet) => !sheet.internalId),
    }))
    .filter((song) => song.sheets.length > 0)

  for (const song of songsWithMissingInternalIdSheets) {
    console.warn(`Song ${song.songId} missing internalId`)
    for (const sheet of song.sheets) {
      console.warn(`  — Sheet [${sheet.type.toUpperCase()}] (${sheet.version}) ${sheet.difficulty}`)
    }
  }

  console.warn(`Total ${songsWithMissingInternalIdSheets.length} songs missing internalId out of ${songs.length} songs`)
}

function mergedAliasIdMap<T>(...aliasMaps: Map<T, string[]>[]): Map<T, string[]> {
  const merged = new Map<T, string[]>()

  for (const aliasMap of aliasMaps) {
    for (const [key, value] of aliasMap) {
      const mergedValue = merged.get(key) ?? []
      merged.set(key, [...mergedValue, ...value])
    }
  }

  return merged
}

async function main() {
  ALIAS_NAME_MAP = mergedAliasIdMap(...(await Promise.all([readAliases1(), readAliases2()])))
  ALIAS_ID_MAP = mergedAliasIdMap(...(await Promise.all([readAliases3(), readAliases4()])))

  console.info('Fetching multiver internal level values...')
  const multiverInternalLevelValues = await getAllMultiverInternalLevelValues()

  console.info('Fetching overridden sheet-specific release dates...')
  const sheetSpecificReleaseDates = await getAllSheetSpecificReleaseDates()

  console.info('Fetching maimai official songs list...')
  const maimaiOfficialSongs = (await fetch('https://maimai.sega.jp/data/maimai_songs.json').then((res) =>
    res.json(),
  )) as MaimaiOfficialSongs[]

  console.info('Reading original data...')
  const dxdata = (await fs.readFile('./original.json', 'utf-8').then(JSON.parse)) as DXDataOriginal.Root

  console.info('Transforming songs...')
  const transformedSongs = dxdata.songs
    .filter(
      // filter out maimai series 宴会場 charts as those has been removed in dx
      (song) => !(song.category === '宴会場' && isMaimaiSeries(song.version)),
    )
    .map(async ({ version: songVersion, releaseDate: entryReleaseDate, comment: _, ...entry }) => {
      const searchAcronyms = await Promise.all(
        uniq(entry.sheets.map((sheet) => sheet.internalId)).map((internalId) => {
          return getSearchAcronyms(entry.title, internalId)
        }),
      ).then((acronyms) => uniq(flatten(acronyms)))
      searchAcronyms.sort((a, b) => a.localeCompare(b))

      return {
        ...entry,
        searchAcronyms,
        imageName: entry.imageName.replace('.png', ''),
        sheets: entry.sheets.map(({ internalLevel: _, levelValue: __, ...sheet }) => {
          const multiverInternalLevelValue = multiverInternalLevelValues
            .filter(
              (value) =>
                value.songId === entry.songId && value.type === sheet.type && value.difficulty === sheet.difficulty,
            )
            .reduce(
              (acc, value) => {
                acc[value.version] = Number.parseFloat(value.internalLevel)
                return acc
              },
              {} as Record<string, number>,
            )

          const officialUtageSong = maimaiOfficialSongs.find(
            (v) =>
              v.title === entry.title &&
              v.catcode === '宴会場' &&
              (v.title !== '[協]青春コンプレックス' ||
                (v.comment === 'バンドメンバーを集めて楽しもう！（入門編）' &&
                  entry.songId === '[協]青春コンプレックス（入門編）') ||
                (v.comment === 'バンドメンバーを集めて挑め！（ヒーロー級）' &&
                  entry.songId === '[協]青春コンプレックス（ヒーロー級）')),
          )

          const is2pUtage = sheet.type === 'utage' && officialUtageSong?.buddy === '○'

          const haveAnyMultiverInternalLevelValue = Object.keys(multiverInternalLevelValue).length > 0

          const releaseDate = (() => {
            const sheetExtra = sheetSpecificReleaseDates.find(
              (v) => v.songId === entry.songId && v.type === sheet.type && v.difficulty === sheet.difficulty,
            )

            if (sheetExtra) {
              return sheetExtra.releaseDate
            }

            return entryReleaseDate
          })()

          return {
            ...sheet,
            difficulty: sheet.difficulty as DifficultyEnum,
            version: (sheet.version ?? songVersion) as VersionEnum,
            type: is2pUtage ? TypeEnum.UTAGE2P : (sheet.type as TypeEnum),
            multiverInternalLevelValue: haveAnyMultiverInternalLevelValue ? multiverInternalLevelValue : undefined,
            comment: officialUtageSong?.comment,
            releaseDate,
          } satisfies Sheet
        }),
      }
    })

  const songs = await Promise.all(transformedSongs)
  checkSongsInternalId(songs)

  console.info('Updating data files...')

  const data = JSON.stringify(
    {
      ...dxdata,
      songs,
    },
    null,
    4,
  )

  await fs.writeFile('../../packages/dxdata/dxdata.json', data)
  await fs.writeFile('../../apps/web/ios/App/App/Assets/dxdata.json', data)
}

main()
  .then(() => {
    console.log('Done')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
