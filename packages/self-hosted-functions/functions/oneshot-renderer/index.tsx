import {
  DifficultyEnum,
  Sheet,
  Song,
  TypeEnum,
  VersionEnum,
  dxdata,
} from "@gekichumai/dxdata";
import { Resvg } from "@resvg/resvg-js";
import clsx from "clsx";
import fs from "fs/promises";
import Koa from "koa";
import satori, { Font } from "satori";
import { match } from "ts-pattern";
import { Rating, calculateRating } from "./calculateRating";
import { demo } from "./demo";

const ASSETS_BASE_DIR = process.env.ASSETS_BASE_DIR;

// declare a new attribute `tw` for JSX elements
declare module "react" {
  interface HTMLAttributes<T> extends DOMAttributes<T> {
    tw?: string;
  }
}

const fetchFontPack = async (): Promise<Font[]> => {
  const fonts = await Promise.all([
    fs.readFile(ASSETS_BASE_DIR + "/fonts/SourceHanSans-Regular.otf"),
    fs.readFile(ASSETS_BASE_DIR + "/fonts/SourceHanSans-Bold.otf"),
  ]);
  if (!fonts[0] || !fonts[1]) return [];
  return [
    {
      name: "Torus",
      data: fonts[0],
      weight: 400,
      style: "normal",
    },
    {
      name: "Torus",
      data: fonts[1],
      weight: 700,
      style: "normal",
    },
  ];
};

interface RenderData {
  sheet: FlattenedSheet;
  achievementRate: number;
  rating: Rating;
}

export const DIFFICULTIES: Record<
  DifficultyEnum,
  { title: string; color: string; dark?: boolean }
> = {
  [DifficultyEnum.Basic]: {
    title: "BASIC",
    color: "#22bb5b",
  },
  [DifficultyEnum.Advanced]: {
    title: "ADVANCED",
    color: "#fb9c2d",
  },
  [DifficultyEnum.Expert]: {
    title: "EXPERT",
    color: "#f64861",
  },
  [DifficultyEnum.Master]: {
    title: "MASTER",
    color: "#9e45e2",
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: "Re:MASTER",
    color: "#ba67f8",
  },
};

export const VERSION_THEME: Record<string, any> = {
  [VersionEnum.FESTiVALPLUS]: {
    background: "/images/background/festival-plus.jpg",
    logo: "/images/version-logo/festival-plus.png",
    favicon: "/favicon/festival-plus-1024x.jpg",
    accentColor: "#c8a8f9",
  },
  [VersionEnum.BUDDiES]: {
    background: "/images/background/buddies.jpg",
    logo: "/images/version-logo/buddies.png",
    favicon: "/favicon/buddies-1024x.jpg",
    accentColor: "#FAAE29",
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: "/images/background/buddies.jpg",
    logo: "/images/version-logo/buddies-plus.png",
    favicon: "/favicon/buddies-1024x.jpg",
    accentColor: "#FAAE29",
  },
};

const renderCell = async (entry: RenderData) => {
  const coverImage = (
    await fs.readFile(
      ASSETS_BASE_DIR + "/images/cover/v2/" + entry.sheet.imageName
    )
  ).buffer;

  const typeImage = (
    await fs.readFile(
      ASSETS_BASE_DIR +
        `/images/type_${entry.sheet.type === TypeEnum.STD ? "sd" : entry.sheet.type}.png`
    )
  ).buffer;

  return (
    <div key={entry.sheet.id} tw="w-1/5 p-[2px] flex h-[96px]">
      <div
        tw="h-full w-full rounded-lg flex items-center justify-start p-2 text-white"
        style={{
          backgroundColor: DIFFICULTIES[entry.sheet.difficulty].color,
        }}
      >
        <img
          // ignore the ts error here
          // @ts-expect-error
          src={coverImage}
          alt={entry.sheet.imageName}
          tw="h-16 w-16 rounded-sm mr-2"
        />
        <div tw="flex flex-col items-start relative">
          <span
            tw={clsx(
              "overflow-hidden font-bold w-[210px] leading-[1.075]",
              match(entry.sheet.title.length)
                .when(
                  (n) => n < 5,
                  () => "text-base"
                )
                .when(
                  (n) => n > 10,
                  () => "text-sm"
                )
                .when(
                  (n) => n > 15,
                  () => "text-[8px]"
                )
                .otherwise(() => "text-base")
            )}
            lang="ja"
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 0 2px rgba(0,0,0,0.5)",
            }}
          >
            {entry.sheet.title}
          </span>

          <div tw="text-sm leading-none mt-1 flex items-center">
            {/* ignore the ts error here
                        @ts-expect-error */}
            <img src={typeImage} alt="" tw="h-[20px] mr-1" />
            <span
              tw="text-[10px] bg-black/50 rounded-full px-[6px] py-[3px] mb-[2px] leading-none font-bold"
              style={{
                boxShadow: "1px 1px 0 rgba(0,0,0,0.35)",
              }}
            >
              {DIFFICULTIES[entry.sheet.difficulty].title}
            </span>
          </div>

          <div tw="flex items-center text-[14px] bg-black/50 rounded-full leading-none pl-[8px] pr-[2px] py-[2px] font-bold mt-1">
            <span tw="text-sm leading-none">
              {entry.achievementRate.toFixed(4)}%
            </span>

            <span tw="text-[12px] leading-none bg-black/50 rounded-full leading-none px-[6px] py-[2px] font-bold ml-1">
              {entry.rating.ratingAwardValue}
            </span>

            <span tw="text-[12px] leading-none bg-black/50 rounded-full leading-none px-[6px] py-[2px] font-bold ml-[2px]">
              {entry.sheet.internalLevelValue.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const renderContent = async ({
  data,
  version,
}: {
  data: {
    b15: RenderData[];
    b35: RenderData[];
  };
  version: VersionEnum;
}) => {
  const theme = VERSION_THEME[version];

  const backgroundBase64 = (
    await fs.readFile(ASSETS_BASE_DIR + theme.background)
  ).toString("base64");

  return (
    <div
      tw="font-sans text-lg leading-none flex flex-wrap px-1 pt-1"
      style={{
        backgroundImage: `url("data:image/jpeg;base64,${backgroundBase64}")`,
        backgroundSize: "1500px 1800px",
      }}
    >
      {await Promise.all(data.b35.map(async (entry) => renderCell(entry)))}

      <div tw="w-full h-[1px] bg-black/20 my-[6px]" />

      {await Promise.all(data.b15.map(async (entry) => renderCell(entry)))}

      <div tw="w-full flex items-center justify-center h-[27px] pt-1">
        <div tw="flex items-center justify-center bg-black/40 rounded-t-lg text-[12px] text-white px-3 pt-1 pb-2 font-bold leading-none">
          Rendered by DXRating.net
        </div>

        <div tw="flex items-center justify-center bg-black/40 rounded-t-lg text-[12px] text-white px-3 pt-1 pb-2 font-bold leading-none ml-1">
          ver. {version}
        </div>
      </div>
    </div>
  );
};

const CANONICAL_ID_PARTS_SEPARATOR = "__dxrt__";

export type FlattenedSheet = Song &
  Sheet & {
    id: string;
    isTypeUtage: boolean;
    isRatingEligible: boolean;
    tags: number[];
    releaseDateTimestamp: number;
  };

export const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join(
    CANONICAL_ID_PARTS_SEPARATOR
  );
};

export const canonicalIdFromParts = (
  songId: string,
  type: TypeEnum,
  difficulty: DifficultyEnum
) => {
  return [songId, type, difficulty].join(CANONICAL_ID_PARTS_SEPARATOR);
};

export const getFlattenedSheets = (version: VersionEnum): FlattenedSheet[] => {
  const songs = dxdata.songs;
  const flattenedSheets = songs.flatMap((song) => {
    return song.sheets.map((sheet) => {
      return {
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        internalLevelValue: sheet.multiverInternalLevelValue
          ? sheet.multiverInternalLevelValue[version] ??
            sheet.internalLevelValue
          : sheet.internalLevelValue,
      };
    });
  });
  return flattenedSheets as FlattenedSheet[];
};

const getData = (
  entries: {
    sheetId: string;
    achievementRate: number;
  }[],
  version: VersionEnum
): { b15: RenderData[]; b35: RenderData[] } => {
  const flattenedSheets = getFlattenedSheets(version);

  const mapped = entries
    .map((entry) => {
      const sheet = flattenedSheets.find((sheet) => sheet.id === entry.sheetId);
      return {
        sheet,
        achievementRate: entry.achievementRate,
        rating: sheet
          ? calculateRating(
              sheet.internalLevelValue ?? 0,
              entry.achievementRate
            )
          : undefined,
      };
    })
    .filter((entry) => entry.sheet && entry.rating) as RenderData[];

  const b15 = mapped
    .filter((entry) => entry.sheet.version === version)
    .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
    .slice(0, 15);

  const b35 = mapped
    .filter((entry) => entry.sheet.version !== version)
    .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
    .slice(0, 35);

  b15.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue;
  });

  b35.sort((a, b) => {
    return b.rating.ratingAwardValue - a.rating.ratingAwardValue;
  });
  return {
    b15,
    b35,
  };
};

export const handler = async (ctx: Koa.Context) => {
  const body = ctx.query.demo
    ? {
        entries: demo,
        version: VersionEnum.BUDDiES,
      }
    : (ctx.request.body as any);
  const version = body.version as VersionEnum;
  const fonts = await fetchFontPack();
  const data = getData(body.entries, version);

  const svg = await satori(await renderContent({ data, version }), {
    width: 1500,
    height: 1000,
    fonts,
    tailwindConfig: {
      theme: {
        fontFamily: {
          sans: "Source Han Sans, sans-serif",
        },
      },
    },
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 10000);
  });

  if (ctx.query.pixelated) {
    const resvg = new Resvg(svg, {
      languages: ["en", "ja"],
      shapeRendering: 2,
      textRendering: 2,
      imageRendering: 1,
      fitTo: {
        mode: "width",
        value: 3000,
      },
      dpi: 600,
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    ctx.type = "image/png";
    ctx.body = pngBuffer;
    return;
  }

  ctx.body = svg;
  ctx.type = "image/svg+xml";
};
