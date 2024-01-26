import process from "process";

import {
  DifficultyEnum,
  Sheet,
  TypeEnum,
  VersionEnum,
} from "@gekichumai/dxdata";
import "dotenv/config";
import he from "he";
import { flatten, uniq } from "lodash";
import fs from "node:fs/promises";
import pg from "pg";
import { DXDataOriginal } from "./original";

// from https://github.com/zetaraku/arcade-songs-fetch/blob/362f2a1b1a1752074951006cedde06948fb0061a/src/maimai/fetch-intl-versions.ts#L16
const VERSION_ID_MAP = new Map([
  ["maimai", 0],
  ["maimai PLUS", 1],
  ["GreeN", 2],
  ["GreeN PLUS", 3],
  ["ORANGE", 4],
  ["ORANGE PLUS", 5],
  ["PiNK", 6],
  ["PiNK PLUS", 7],
  ["MURASAKi", 8],
  ["MURASAKi PLUS", 9],
  ["MiLK", 10],
  ["MiLK PLUS", 11],
  ["FiNALE", 12],
  ["maimaiでらっくす", 13],
  ["maimaiでらっくす PLUS", 14],
  ["Splash", 15],
  ["Splash PLUS", 16],
  ["UNiVERSE", 17],
  ["UNiVERSE PLUS", 18],
  ["FESTiVAL", 19],
  ["FESTiVAL PLUS", 20],
  ["BUDDiES", 21],
  //! add further version here !//
]);

const isMaimaiSeries = (version: string) => {
  const versionId = VERSION_ID_MAP.get(version);
  return versionId !== undefined && versionId <= 12; // 12 is the id of FiNALE
};

async function readAliases1() {
  const aliases = await (
    await fetch(
      "https://raw.githubusercontent.com/lomotos10/GCM-bot/main/data/aliases/en/chuni.tsv"
    )
  ).text();
  const lines = aliases.split("\n");
  const aliasesMap = new Map<string, string[]>();
  for (const line of lines) {
    const segments = line.split("\t");
    aliasesMap.set(segments[0], segments.slice(1));
  }
  return aliasesMap;
}

async function readAliases2() {
  const aliases = await (
    await fetch("https://api.yuzuai.xyz/maimaidx/maimaidxalias")
  ).json();
  const aliasesMap = new Map<string, string[]>();
  const aliasesObj = aliases as Record<string, { Alias: string[] }>;
  for (const [key, value] of Object.entries(aliasesObj)) {
    const cleanedAliases = value.Alias.map((alias) => he.decode(alias));
    aliasesMap.set(key, cleanedAliases);
  }
  return aliasesMap;
}

let ALIAS_NAME_MAP: Map<string, string[]>;
let ALIAS_ID_MAP: Map<string, string[]>;
let ALIAS_NAME_EXTRA_MAP: Record<string, string[]> = {
  Hainuwele: ["华为", "华为完了"],
  "ULTRA SYNERGY MATRIX": ["USM", "我来出勤了"],
  神っぽいな: ["像神一样"],
};

async function getSearchAcronyms(title: string, id?: number) {
  const searchAcronyms = [];

  const alias1 = ALIAS_NAME_MAP.get(title);
  if (alias1) {
    searchAcronyms.push(...alias1);
  }

  if (id) {
    const alias2 = ALIAS_ID_MAP.get(id.toString());
    if (alias2) {
      searchAcronyms.push(...alias2);
    }
  }

  if (ALIAS_NAME_EXTRA_MAP[title]) {
    searchAcronyms.push(...ALIAS_NAME_EXTRA_MAP[title]);
  }

  return uniq(searchAcronyms).filter(
    (acronym) => !!acronym && acronym.toLowerCase() !== title.toLowerCase()
  );
}

export interface MultiverInternalLevelValue {
  songId: string;
  type: string;
  difficulty: string;
  internalLevel: string;
  version: string;
}

async function getAllMultiverInternalLevelValues() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL not set, skipping getAllMultiverInternalLevelValues"
    );
    return [];
  }

  const conn = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await conn.connect();

  const { rows } = await conn.query<MultiverInternalLevelValue>(
    `SELECT * FROM "public"."SheetInternalLevels" ORDER BY "songId","type","difficulty","version";`
  );
  await conn.end();

  return rows;
}

export interface MaimaiOfficialSongs {
  artist: string;
  catcode:
    | "maimai"
    | "POPS＆アニメ"
    | "ゲーム＆バラエティ"
    | "niconico＆ボーカロイド"
    | "東方Project"
    | "オンゲキ＆CHUNITHM"
    | "宴会場";
  image_url: string;
  release: string;
  lev_bas?: string;
  lev_adv?: string;
  lev_exp?: string;
  lev_mas?: string;
  sort: string;
  title: string;
  title_kana: string;
  version: string;
  lev_remas?: string;
  dx_lev_bas?: string;
  dx_lev_adv?: string;
  dx_lev_exp?: string;
  dx_lev_mas?: string;
  date?: string;
  dx_lev_remas?: string;
  key?: "○";
  lev_utage?: string;
  kanji?: string;
  comment?: string;
  buddy?: "○";
}

async function main() {
  ALIAS_NAME_MAP = await readAliases1();
  ALIAS_ID_MAP = await readAliases2();

  console.info("Fetching multiver internal level values...");
  const multiverInternalLevelValues = await getAllMultiverInternalLevelValues();

  console.info("Fetching maimai official songs list...");
  const maimaiOfficialSongs = (await fetch(
    "https://maimai.sega.jp/data/maimai_songs.json"
  ).then((res) => res.json())) as MaimaiOfficialSongs[];

  console.info("Reading original data...");
  const dxdata = (await fs
    .readFile("./original.json", "utf-8")
    .then(JSON.parse)) as DXDataOriginal.Root;

  console.info("Transforming songs...");
  const transformedSongs = dxdata.songs
    .filter(
      // filter out maimai series 宴会場 charts as those has been removed in dx
      (song) => !(song.category === "宴会場" && isMaimaiSeries(song.version))
    )
    .map(async (entry) => {
      const searchAcronyms = await Promise.all([
        getSearchAcronyms(entry.title, entry.internalId?.std),
        getSearchAcronyms(entry.title, entry.internalId?.dx),
      ]).then((acronyms) => uniq(flatten(acronyms)));

      return {
        ...entry,
        searchAcronyms,
        imageName: entry.imageName.replace(".png", ".jpg"),
        sheets: entry.sheets.map(
          ({ internalLevel: _, levelValue: __, ...sheet }) => {
            const multiverInternalLevelValue = multiverInternalLevelValues
              .filter(
                (value) =>
                  value.songId === entry.songId &&
                  value.type === sheet.type &&
                  value.difficulty === sheet.difficulty
              )
              .reduce(
                (acc, value) => {
                  acc[value.version] = parseFloat(value.internalLevel);
                  return acc;
                },
                {} as Record<string, number>
              );

            const officialUtageSong = maimaiOfficialSongs.find(
              (v) =>
                v.title === entry.title &&
                v.catcode === "宴会場" &&
                (v.title !== "[協]青春コンプレックス" ||
                  (v.comment === "バンドメンバーを集めて楽しもう！（入門編）" &&
                    entry.songId === "[協]青春コンプレックス（入門編）") ||
                  (v.comment === "バンドメンバーを集めて挑め！（ヒーロー級）" &&
                    entry.songId === "[協]青春コンプレックス（ヒーロー級）"))
            );

            const is2pUtage =
              sheet.type === "utage" && officialUtageSong?.buddy === "○";

            const haveAnyMultiverInternalLevelValue =
              Object.keys(multiverInternalLevelValue).length > 0;

            return {
              ...sheet,
              songId: entry.songId,
              difficulty: sheet.difficulty as DifficultyEnum,
              version: sheet.version as VersionEnum,
              type: is2pUtage ? TypeEnum.UTAGE2P : (sheet.type as TypeEnum),
              multiverInternalLevelValue: haveAnyMultiverInternalLevelValue
                ? multiverInternalLevelValue
                : undefined,
              comment: officialUtageSong?.comment,
            } satisfies Sheet;
          }
        ),
      };
    });

  console.info("Updating data files...");

  const data = JSON.stringify(
    {
      ...dxdata,
      songs: await Promise.all(transformedSongs),
    },
    null,
    4
  );

  await fs.writeFile("../../packages/dxdata/dxdata.json", data);
  await fs.writeFile("../../apps/web/ios/App/App/Assets/dxdata.json", data);
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
