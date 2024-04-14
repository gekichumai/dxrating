import { Sheet, Song, VersionEnum, dxdata } from "@gekichumai/dxdata";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs/promises";
import Koa from "koa";
import satori, { Font } from "satori";
import { Rating, calculateRating } from "./calculateRating";
import { demo } from "./demo";
import { renderContent } from "./renderContent";

export const ONESHOT_HEIGHT = 1100;
export const ONESHOT_WIDTH = 1500;

export const ASSETS_BASE_DIR = process.env.ASSETS_BASE_DIR;

// declare a new attribute `tw` for JSX elements
declare module "react" {
  interface HTMLAttributes<T> extends DOMAttributes<T> {
    tw?: string;
  }
}

export interface RenderData {
  sheet: FlattenedSheet;
  achievementRate: number;
  rating: Rating;
}
const CANONICAL_ID_PARTS_SEPARATOR = "__dxrt__";

const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join(
    CANONICAL_ID_PARTS_SEPARATOR
  );
};

const getFlattenedSheetsMap = () => {
  const calcFlattenedSheets = (version: VersionEnum): FlattenedSheet[] => {
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

  let cachedFlattenedSheets: Map<
    VersionEnum,
    Map<string, FlattenedSheet>
  > = new Map();
  for (const version of Object.values(VersionEnum)) {
    const calc = calcFlattenedSheets(version);
    const map = new Map<string, FlattenedSheet>();
    for (const sheet of calc) {
      map.set(sheet.id, sheet);
    }
    cachedFlattenedSheets.set(version, map);
  }
  return cachedFlattenedSheets;
};

const flattenedSheets = getFlattenedSheetsMap();

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

let cachedFonts: Font[] | null = null;

type FlattenedSheet = Song &
  Sheet & {
    id: string;
    isTypeUtage: boolean;
    isRatingEligible: boolean;
    tags: number[];
    releaseDateTimestamp: number;
  };

const getData = (
  entries: {
    sheetId: string;
    achievementRate: number;
  }[],
  version: VersionEnum
): { b15: RenderData[]; b35: RenderData[] } => {
  const mapped = entries
    .flatMap((entry) => {
      const sheet = flattenedSheets.get(version)?.get(entry.sheetId);
      if (!sheet) {
        return [];
      }
      return [
        {
          sheet,
          achievementRate: entry.achievementRate,
          rating: sheet
            ? calculateRating(
                sheet.internalLevelValue ?? 0,
                entry.achievementRate
              )
            : undefined,
        },
      ];
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

interface ServerTimingTimerObservation {
  name: string;
  duration: number;
}

const createServerTimingTimer = () => {
  const observations: ServerTimingTimerObservation[] = [];
  return {
    start: (name: string) => {
      observations.push({
        name,
        duration: Date.now(),
      });
    },
    stop: (name: string) => {
      const obs = observations.find((o) => o.name === name);
      if (obs) {
        obs.duration = Date.now() - obs.duration;
      }
    },
    get: () => {
      return observations.map((obs) => `${obs.name};dur=${obs.duration}`);
    },
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

  const timer = createServerTimingTimer();

  timer.start("font");
  if (!cachedFonts) {
    cachedFonts = await fetchFontPack();
  }
  const fonts = cachedFonts;
  timer.stop("font");

  timer.start("calc");
  const data = getData(body.entries, version);
  timer.stop("calc");

  timer.start("jsx");
  const content = await renderContent({ data, version });
  timer.stop("jsx");

  timer.start("satori");
  const svg = await satori(content, {
    width: ONESHOT_WIDTH,
    height: ONESHOT_HEIGHT,
    fonts,
    tailwindConfig: {
      theme: {
        fontFamily: {
          sans: "Source Han Sans, sans-serif",
        },
      },
    },
  });
  timer.stop("satori");

  if (ctx.query.pixelated) {
    timer.start("resvg_init");
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
    timer.stop("resvg_init");

    timer.start("resvg_render");
    const pngData = resvg.render();
    timer.stop("resvg_render");

    timer.start("resvg_as_png");
    const pngBuffer = pngData.asPng();
    timer.stop("resvg_as_png");

    ctx.set("Server-Timing", timer.get().join(", "));

    ctx.type = "image/png";
    ctx.body = pngBuffer;
    return;
  }

  ctx.set("Server-Timing", timer.get().join(", "));
  ctx.body = svg;
  ctx.type = "image/svg+xml";
};
