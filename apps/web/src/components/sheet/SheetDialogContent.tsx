import {
  MULTIVER_AVAILABLE_VERSIONS,
  VERSION_ID_MAP,
  VERSION_SLUG_MAP,
} from "@gekichumai/dxdata";
import {
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import clsx from "clsx";
import { FC, PropsWithChildren, memo, useEffect, useMemo, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import IconMdiSearchWeb from "~icons/mdi/search-web";
import IconMdiSpotify from "~icons/mdi/spotify";
import IconMdiYouTube from "~icons/mdi/youtube";
import { useAppContextDXDataVersion } from "../../models/context/useAppContext";
import { FlattenedSheet } from "../../songs";
import { calculateRating } from "../../utils/rating";
import { DXRank } from "../DXRank";
import { SheetTitle } from "../SheetListItem";
import { SheetDialogContentHeader } from "./SheetDialogContentHeader";

const PRESET_ACHIEVEMENT_RATES = [
  100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50,
];

const DeltaArrow: FC<{ delta: number }> = ({ delta }) => {
  const direction = match(delta)
    .when(
      (d) => d > 0,
      () => "up",
    )
    .when(
      (d) => d < 0,
      () => "down",
    )
    .otherwise(() => "neutral");

  return (
    <img
      src={`https://shama.dxrating.net/images/rating-arrow/${direction}.png`}
      alt={direction}
      className="w-6 h-6 touch-callout-none"
      draggable={false}
    />
  );
};

const SectionHeader: FC<PropsWithChildren<object>> = ({ children }) => (
  <div className="font-lg font-bold">
    <span className="pb-1 px-1 mb-1 border-b border-solid border-gray-200 tracking-tight">
      {children}
    </span>
  </div>
);

export interface SheetDialogContentProps {
  sheet: FlattenedSheet;
  currentAchievementRate?: number;
}

export const SheetDialogContent: FC<SheetDialogContentProps> = memo(
  ({ sheet, currentAchievementRate }) => {
    const { t, i18n } = useTranslation(["sheet"]);
    const ratings = useMemo(() => {
      const rates = [...PRESET_ACHIEVEMENT_RATES];
      if (currentAchievementRate && !rates.includes(currentAchievementRate)) {
        rates.push(currentAchievementRate);
      }
      rates.sort((a, b) => b - a);
      return rates.map((rate) => ({
        achievementRate: rate,
        rating: calculateRating(sheet.internalLevelValue, rate),
      }));
    }, [sheet, currentAchievementRate]);
    const releaseDate = new Date(sheet.releaseDate + "T09:00:00+09:00");

    return (
      <div className="flex flex-col gap-2 relative">
        <SheetDialogContentHeader sheet={sheet} />

        <SheetTitle
          sheet={sheet}
          enableAltNames
          enableClickToCopy
          className="text-lg font-bold"
        />

        <div className="text-sm -mt-2">
          <div className="text-zinc-600">
            {t("sheet:release-date", {
              absoluteDate: releaseDate.toLocaleString(i18n.language, {
                dateStyle: "medium",
              }),
              relativeDate: new Intl.RelativeTimeFormat(i18n.language, {
                numeric: "auto",
              }).format(
                Math.floor(
                  (releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                ),
                "day",
              ),
            })}
          </div>
        </div>

        {/* <div className="flex flex-wrap gap-1">
          <SheetTags sheet={sheet} />
        </div> */}

        <div className="flex items-center">
          <IconMdiSearchWeb className="mr-2" />

          <Button
            startIcon={<IconMdiYouTube />}
            variant="outlined"
            href={`https://www.youtube.com/results?search_query=maimai+${sheet.title}+${sheet.difficulty}`}
            target="_blank"
            className="inline-flex !text-[#ff0000] !b-[#ff0000] !font-bold !mr-1"
          >
            YouTube
          </Button>

          <IconButton
            href={`https://open.spotify.com/search/${sheet.title}`}
            target="_blank"
            className="inline-flex !text-[#1db954] !b-[#1db954] !font-bold"
          >
            <IconMdiSpotify className="h-6 w-6" />
          </IconButton>
        </div>

        <div className="flex flex-col gap-6 mt-2">
          {!sheet.isTypeUtage && (
            <div className="flex flex-col gap-1">
              <SectionHeader>
                {t("sheet:internal-level-history.title")}
              </SectionHeader>
              <SheetInternalLevelHistory sheet={sheet} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <SectionHeader>{t("sheet:details.title")}</SectionHeader>
            <div>
              <Table size="small" className="mb-4">
                <TableHead>
                  <TableRow>
                    <TableCell width="100px">
                      {t("sheet:details.category")}
                    </TableCell>
                    <TableCell width="200px">{sheet.category}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>{t("sheet:details.song-artist")}</TableCell>
                    <TableCell>{sheet.artist}</TableCell>
                  </TableRow>

                  {!sheet.isTypeUtage && (
                    <>
                      <TableRow>
                        <TableCell>{t("sheet:details.bpm")}</TableCell>
                        <TableCell>{sheet.bpm}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          {t("sheet:details.chart-designer")}
                        </TableCell>
                        <TableCell>{sheet.noteDesigner}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell colSpan={2}>
                          {t("sheet:details.notes-statistics.title")}
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.tap")}
                        </TableCell>
                        <TableCell>{sheet.noteCounts.tap ?? 0}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.hold")}
                        </TableCell>
                        <TableCell>{sheet.noteCounts.hold ?? 0}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.slide")}
                        </TableCell>
                        <TableCell>{sheet.noteCounts.slide ?? 0}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.touch")}
                        </TableCell>
                        <TableCell>{sheet.noteCounts.touch ?? 0}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.break")}
                        </TableCell>
                        <TableCell>{sheet.noteCounts.break ?? 0}</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-1">
                        <TableCell>
                          — {t("sheet:details.notes-statistics.total")}
                        </TableCell>
                        <TableCell>
                          {sheet.noteCounts.total?.toLocaleString("en-US")}
                        </TableCell>
                      </TableRow>
                    </>
                  )}

                  <TableRow>
                    <TableCell>
                      {t("sheet:details.regional-availability")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {Object.entries(sheet.regions).map(
                          ([region, available]) => (
                            <div
                              key={region}
                              className={clsx(
                                "uppercase font-mono text-white font-bold select-none px-2 py-1 rounded-full text-xs",
                                available ? "!bg-green-500" : "!bg-gray-300",
                              )}
                            >
                              {region}
                            </div>
                          ),
                        )}{" "}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-4 text-xs text-gray-500 text-right">
                <Trans
                  i18nKey="sheet:details.credits"
                  components={{
                    link: (
                      <a
                        href={`https://arcade-songs.zetaraku.dev/maimai/song/?id=${encodeURIComponent(
                          sheet.songId,
                        )}`}
                        rel="noreferrer"
                        target="_blank"
                        className="tracking-tighter"
                      >
                        arcade-songs.zetaraku.dev
                      </a>
                    ),
                  }}
                />
              </div>
            </div>
          </div>
          {!sheet.isTypeUtage && (
            <div className="flex flex-col gap-1">
              <SectionHeader>
                {t("sheet:details.achievement-to-rating.title")}
              </SectionHeader>
              <div>
                <Table className="tabular-nums !font-mono" size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="100px">
                        {t("sheet:details.achievement-to-rating.achievement")}
                      </TableCell>
                      <TableCell width="50px">
                        {t("sheet:details.achievement-to-rating.rating")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ratings.map((rating, i) => {
                      const nextRating =
                        i === ratings.length - 1 ? null : ratings[i + 1];
                      const isCurrentAchievementRateRow =
                        rating.achievementRate === currentAchievementRate;

                      return (
                        <TableRow
                          key={rating.achievementRate}
                          sx={{
                            "&:last-child td, &:last-child th": { border: 0 },
                          }}
                          className={clsx(
                            isCurrentAchievementRateRow && "bg-amber",
                          )}
                        >
                          <TableCell component="th" scope="row">
                            <div
                              className={clsx("flex items-center font-sans")}
                            >
                              <DXRank
                                rank={rating.rating.rank}
                                className="h-8"
                              />
                              <SheetAchievementRate
                                value={rating.achievementRate}
                              />
                              {isCurrentAchievementRateRow && (
                                <Chip
                                  label="Current"
                                  size="small"
                                  className="ml-2"
                                  color="default"
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="relative font-sans">
                              <span className="font-bold">
                                {rating.rating.ratingAwardValue}
                              </span>

                              {nextRating && (
                                <div className="absolute -bottom-5 -left-1 px-1 text-xs text-gray-500 bg-zinc-100 shadow-[0_0_0_1px_var(--un-shadow-color)] shadow-zinc-300/80 rounded-xs">
                                  ↑{" "}
                                  <span className="font-bold">
                                    {rating.rating.ratingAwardValue -
                                      nextRating.rating.ratingAwardValue}
                                  </span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
SheetDialogContent.displayName = "memo(SheetDialogContent)";

const SheetAchievementRate: FC<{ value: number }> = ({ value }) => {
  const integer = Math.floor(value);
  const decimal = value % 1;

  return (
    <div className="inline-flex items-center">
      <span className="font-bold">{integer}</span>
      <span>.</span>
      <span className={clsx(decimal === 0 && "text-zinc-4")}>
        {decimal.toFixed(4).slice(2)}
      </span>
      <span>%</span>
    </div>
  );
};

const SheetInternalLevelHistory: FC<{
  sheet: FlattenedSheet;
}> = ({ sheet }) => {
  const { t } = useTranslation(["sheet"]);
  const appVersion = useAppContextDXDataVersion();
  const scrollableContainer = useRef<HTMLDivElement>(null);
  const multiverInternalLevelValues = useMemo(
    () =>
      MULTIVER_AVAILABLE_VERSIONS.map((version) => ({
        version,
        internalLevelValue: sheet.multiverInternalLevelValue?.[version],
        available:
          VERSION_ID_MAP.get(version)! >= VERSION_ID_MAP.get(sheet.version)!,
      })).reduce(
        (acc, { version, internalLevelValue, ...extra }) => {
          // add `delta` field
          let delta: number | undefined;
          const accReversed = [...acc].reverse();
          const prev = accReversed.find(
            (v) => v.internalLevelValue !== undefined,
          );
          if (
            prev &&
            internalLevelValue !== undefined &&
            prev.internalLevelValue !== undefined
          ) {
            delta = internalLevelValue - prev.internalLevelValue;
          }

          acc.push({ version, internalLevelValue, delta, ...extra });
          return acc;
        },
        [] as {
          version: string;
          internalLevelValue?: number;
          delta?: number;
          available: boolean;
        }[],
      ),
    [sheet],
  );

  useEffect(() => {
    if (scrollableContainer.current) {
      // hide the scrollbar when scrolling to the right
      scrollableContainer.current.style.overflowX = "hidden";
      scrollableContainer.current.scrollLeft =
        scrollableContainer.current.scrollWidth;
      // restore the scrollbar
      scrollableContainer.current.style.overflowX = "auto";
    }
  }, [multiverInternalLevelValues]);

  return (
    <div className="overflow-x-auto" ref={scrollableContainer}>
      {multiverInternalLevelValues.filter(
        (v) => v.internalLevelValue !== undefined,
      ).length > 0 ? (
        <Table size="small" className="mb-4">
          <TableHead>
            <TableRow>
              {multiverInternalLevelValues.map(({ version, available }) => (
                <TableCell
                  key={version}
                  className={clsx(
                    appVersion === version && "bg-amber-200",
                    !available && "opacity-50",
                  )}
                >
                  <img
                    src={`https://shama.dxrating.net/images/version-title/${VERSION_SLUG_MAP.get(
                      version,
                    )}.png`}
                    alt={VERSION_SLUG_MAP.get(version)}
                    className="h-40.75px w-83px min-w-[83px] -ml-1 touch-callout-none"
                    draggable={false}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              {multiverInternalLevelValues.map(
                ({ version, internalLevelValue, available, delta }) => (
                  <TableCell
                    key={version}
                    className={clsx(
                      appVersion === version && "bg-amber-200",
                      !available && "opacity-50",
                    )}
                  >
                    {internalLevelValue === undefined ? (
                      <div className="text-gray-500 select-none">
                        {available ? "—" : "／"}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-bold tabular-nums">
                          {internalLevelValue?.toFixed(1)}
                        </span>
                        {delta !== undefined && <DeltaArrow delta={delta} />}
                      </div>
                    )}
                  </TableCell>
                ),
              )}
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <div className="text-gray-500 px-1">
          {t("sheet:internal-level-history.empty")}
        </div>
      )}
    </div>
  );
};
