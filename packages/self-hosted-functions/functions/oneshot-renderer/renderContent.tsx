import { DifficultyEnum, TypeEnum, VersionEnum } from "@gekichumai/dxdata";
import { execSync } from "child_process";
import clsx from "clsx";
import fs from "fs/promises";
import { FC, PropsWithChildren } from "react";
import { ASSETS_BASE_DIR, Region, RenderData } from ".";

interface VersionTheme {
  background: string;
  logo: string;
  favicon: string;
  accentColor: string;
  backgroundSize: [number, number];
}

export const VERSION_THEME: Record<string, VersionTheme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background: "/images/background/festival-plus.jpg",
    logo: "/images/version-logo/festival-plus.png",
    favicon: "/favicon/festival-plus-1024x.jpg",
    accentColor: "#c8a8f9",
    backgroundSize: [2200, 2400],
  },
  [VersionEnum.BUDDiES]: {
    background: "/images/background/buddies.jpg",
    logo: "/images/version-logo/buddies.png",
    favicon: "/favicon/buddies-1024x.jpg",
    accentColor: "#FAAE29",
    backgroundSize: [2000, 2400],
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: "/images/background/buddies.jpg",
    logo: "/images/version-logo/buddies-plus.png",
    favicon: "/favicon/buddies-1024x.jpg",
    accentColor: "#FAAE29",
    backgroundSize: [2000, 2400],
  },
};

const DIFFICULTIES: Record<
  DifficultyEnum,
  { title: string; color: string; inverted?: boolean }
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
  },
  [DifficultyEnum.ReMaster]: {
    title: "Re:MASTER",
    color: "#951BEF",
    inverted: true,
  },
};

const renderCell = async (entry: RenderData | undefined, i: number) => {
  if (!entry) {
    return (
      <div key="empty" tw="w-1/5 p-[2px] flex h-[96px]">
        <div tw="h-full w-full rounded-lg" />
      </div>
    );
  }

  const [coverImage, typeImage] = await Promise.all([
    fs.readFile(ASSETS_BASE_DIR + "/images/cover/v2/" + entry.sheet.imageName),
    fs.readFile(
      ASSETS_BASE_DIR +
        `/images/type_${entry.sheet.type === TypeEnum.STD ? "sd" : entry.sheet.type}.png`
    ),
  ]);

  const theme = DIFFICULTIES[entry.sheet.difficulty];

  const backgroundColor = theme.inverted ? "#EBCFFF" : theme.color;
  const foregroundColor = theme.inverted ? theme.color : "#fff";
  const shadowColor = theme.inverted
    ? "rgba(255,255,255,0.5)"
    : "rgba(0,0,0,0.5)";
  const adornmentColor = theme.inverted ? "#000000a0" : "#ffffffa0";

  return (
    <div key={entry.sheet.id} tw="w-1/5 p-[2px] flex h-[96px]">
      <div
        tw="h-full w-full rounded-lg flex items-center justify-start p-2"
        style={{
          background: `linear-gradient(135deg, ${backgroundColor}, ${backgroundColor}cc)`,
          color: foregroundColor,
        }}
      >
        <img
          // ignore the ts error here
          // @ts-expect-error
          src={coverImage.buffer}
          alt={entry.sheet.imageName}
          tw="h-[76px] w-[76px] rounded-sm mr-2"
        />
        <div tw="flex flex-col items-start relative">
          <span
            tw="overflow-hidden font-bold w-[200px]"
            lang="ja"
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 0 2px " + shadowColor,
              lineHeight: "16px",
              fontSize: (() => {
                const length = entry.sheet.title.length;
                if (length <= 5) return "16px";
                if (length <= 10) return "15px";
                if (length <= 15) return "14px";
                return "13px";
              })(),
            }}
          >
            {entry.sheet.title}
          </span>

          <div tw="text-sm leading-none mt-1 flex items-center">
            {/* ignore the ts error here
                        @ts-expect-error */}
            <img src={typeImage.buffer} alt="" tw="h-[20px] mr-1" />
            <span
              tw="text-[10px] bg-black/50 rounded-full px-[6px] py-[3px] mb-[2px] leading-none font-bold mr-1 flex items-center text-white"
              style={{
                boxShadow: "1px 1px 0 rgba(0,0,0,0.35)",
              }}
            >
              <span>{DIFFICULTIES[entry.sheet.difficulty].title}</span>

              <div tw="w-[1px] h-[10px] bg-white/40 mx-1" />

              <span>{entry.sheet.internalLevelValue.toFixed(1)}</span>
            </span>
          </div>

          <div tw="flex items-center text-[14px] bg-black/50 rounded-full leading-none pl-[8px] pr-[2px] py-[2px] font-bold mt-1 text-white">
            <span tw="text-sm leading-none">
              {entry.achievementRate.toFixed(4)}%
            </span>

            <span tw="text-sm leading-none ml-1 font-normal opacity-80">
              {entry.rating.rank?.replace("p", "+")?.toUpperCase()}
            </span>

            <span tw="text-[12px] leading-none bg-black/50 rounded-full leading-none px-[6px] py-[2px] font-bold ml-1">
              {entry.rating.ratingAwardValue}
            </span>
          </div>
        </div>

        <div
          tw="absolute bottom-2 right-2 text-[9px] font-bold leading-none"
          style={{ color: adornmentColor }}
        >
          {"#" + (i + 1)}
        </div>
      </div>
    </div>
  );
};

const padArray = <T,>(arr: T[], len: number, fill?: T): (T | undefined)[] => {
  return arr.concat(Array(len).fill(fill)).slice(0, len);
};

const gitVersion = execSync("git rev-parse HEAD").toString().trim();

const FactItem = ({
  value,
  label,
  size = "sm",
  tw,
}: {
  value: string;
  label: string;
  size?: "sm" | "lg";
  tw?: string;
}) => {
  return (
    <div tw={clsx("flex flex-col items-start justify-center", tw)}>
      <div
        tw={clsx(
          "leading-none font-semibold",
          size === "sm" ? "text-2xl mb-[2px]" : "text-3xl"
        )}
      >
        {value}
      </div>
      <div tw={clsx("leading-none", size === "sm" ? "text-sm" : "text-base")}>
        {label}
      </div>
    </div>
  );
};

const calculateFitSize = (
  assetWidth: number,
  assetHeight: number,
  containerWidth: number,
  containerHeight: number
): { width: number; height: number } => {
  // Calculate the scale ratios for width and height
  const widthRatio = containerWidth / assetWidth;
  const heightRatio = containerHeight / assetHeight;

  // Choose the larger ratio so the asset completely covers the container
  const scale = Math.max(widthRatio, heightRatio);

  // Calculate the scaled dimensions
  const scaledWidth = assetWidth * scale;
  const scaledHeight = assetHeight * scale;

  return {
    width: scaledWidth,
    height: scaledHeight,
  };
};

export const BottomLabel: FC<
  PropsWithChildren<{
    first?: boolean;
  }>
> = ({ first, children }) => {
  return (
    <div
      tw={clsx(
        "flex items-center justify-center bg-black/40 rounded-t-lg text-[12px] text-white px-3 pt-1 pb-2 font-bold leading-none",
        !first && "ml-1"
      )}
    >
      {children}
    </div>
  );
};

export const renderContent = async ({
  data,
  version,
  region,
}: {
  data: {
    b15: RenderData[];
    b35: RenderData[];
  };
  version: VersionEnum;
  region?: Region;
}) => {
  const theme = VERSION_THEME[version];

  const background = (await fs.readFile(ASSETS_BASE_DIR + theme.background))
    .buffer;

  const b50Sum = [...data.b15, ...data.b35].reduce(
    (acc, cur) => acc + cur.rating.ratingAwardValue,
    0
  );

  const b15Sum = data.b15.reduce(
    (acc, cur) => acc + cur.rating.ratingAwardValue,
    0
  );
  const b35Sum = data.b35.reduce(
    (acc, cur) => acc + cur.rating.ratingAwardValue,
    0
  );

  const formattedRegionSuffix = region
    ? region === "_generic"
      ? " (Generic)"
      : ` (${region.toUpperCase()})`
    : "";

  return (
    <div tw="font-sans text-lg leading-none flex flex-wrap px-1 pt-1 h-full">
      <img
        tw="absolute inset-0 w-full h-full"
        // @ts-expect-error
        src={background}
        alt=""
        style={{
          objectFit: "cover",
        }}
      />
      <div tw="h-[100px] w-full flex pt-[2px] pb-1 px-[2px]">
        <div tw="overflow-hidden w-full h-full flex items-center">
          <div tw="flex items-end justify-start py-4 px-6 rounded-lg w-full bg-black/80 text-white">
            <FactItem
              value={b50Sum.toFixed(0)}
              label="Total"
              size="lg"
              tw="mr-6"
            />

            <FactItem value={b15Sum.toFixed(0)} label="B15" tw="mr-4" />
            <FactItem value={b35Sum.toFixed(0)} label="B35" />
          </div>
        </div>
      </div>

      {await Promise.all(padArray(data.b35, 35).map(renderCell))}

      <div tw="w-full h-[1px] bg-black/20 my-[6px]" />

      {await Promise.all(padArray(data.b15, 15).map(renderCell))}

      <div tw="w-full flex items-center justify-center h-[27px] pt-1">
        <BottomLabel first>Rendered by DXRating.net</BottomLabel>

        <BottomLabel>Renderer Revision {gitVersion.slice(0, 7)}</BottomLabel>

        <BottomLabel>
          ver. {version}
          {formattedRegionSuffix}
        </BottomLabel>
      </div>
    </div>
  );
};
