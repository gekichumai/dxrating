import { MULTIVER_AVAILABLE_VERSIONS, VersionEnum } from "@gekichumai/dxdata";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import { motion } from "framer-motion";
import { FC, memo, useMemo, useState } from "react";
import MdiChevronDown from "~icons/mdi/chevron-down";
import IconMdiOpenInNew from "~icons/mdi/open-in-new";
import IconMdiSearchWeb from "~icons/mdi/search-web";
import IconMdiSpotify from "~icons/mdi/spotify";
import IconMdiYouTube from "~icons/mdi/youtube";
import { FlattenedSheet } from "../songs";
import { calculateRating } from "../utils/rating";
import { DXRank } from "./DXRank";
import { SheetTitle } from "./SheetListItem";

const PRESET_ACHIEVEMENT_RATES = [
  100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50,
];

const SheetDialogContentHeader: FC<{ sheet: FlattenedSheet }> = memo(
  ({ sheet }) => {
    const [expanded, setExpanded] = useState(false);

    const variants = {
      collapsed: {
        height: "4rem",
        width: "4rem",
        borderRadius: "0.5rem",
        cursor: "zoom-in",
      },
      expanded: {
        height: "14rem",
        width: "14rem",
        borderRadius: "1rem",
        cursor: "zoom-out",
      },
    };

    return (
      <div className="flex items-center">
        <motion.img
          layout
          src={
            "https://dxrating-assets.imgg.dev/images/cover/v2/" +
            sheet.imageName.replace(/\.png$/, ".jpg")
          }
          alt={sheet.imageName}
          className="overflow-hidden rounded-lg bg-slate-300/50"
          variants={variants}
          initial="collapsed"
          animate={expanded ? "expanded" : "collapsed"}
          transition={{
            type: "spring",
            damping: 18,
            stiffness: 235,
          }}
          onClick={() => setExpanded((prev) => !prev)}
        />

        <div className="flex-1" />

        <div className="text-4xl text-zinc-900/60 leading-none">
          {sheet.internalLevelValue.toFixed(1)}
        </div>
      </div>
    );
  },
);

export interface SheetDialogContentProps {
  sheet: FlattenedSheet;
  currentAchievementRate?: number;
}

export const SheetDialogContent: FC<SheetDialogContentProps> = memo(
  ({ sheet, currentAchievementRate }) => {
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

    const multiverInternalLevelValues = useMemo(
      () =>
        MULTIVER_AVAILABLE_VERSIONS.map((version) => ({
          version,
          internalLevelValue:
            sheet.multiverInternalLevelValue?.[version as VersionEnum],
        })),
      [sheet],
    );

    return (
      <div className="flex flex-col gap-2 relative">
        <SheetDialogContentHeader sheet={sheet} />

        <SheetTitle
          title={sheet.title}
          altNames={sheet.searchAcronyms}
          difficulty={sheet.difficulty}
          type={sheet.type}
          version={sheet.version}
          className="text-lg font-bold"
        />

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

        <div>
          <Accordion className="bg-zinc-100/60" defaultExpanded>
            <AccordionSummary expandIcon={<MdiChevronDown />}>
              Internal Level History
            </AccordionSummary>
            <AccordionDetails className="overflow-x-auto">
              {multiverInternalLevelValues.filter(
                (v) => v.internalLevelValue !== undefined,
              ).length > 1 ? (
                <Table size="small" className="mb-4">
                  <TableHead>
                    <TableRow>
                      {multiverInternalLevelValues.map(({ version }) => (
                        <TableCell key={version}>{version}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      {multiverInternalLevelValues.map(
                        ({ internalLevelValue }) => (
                          <TableCell key={internalLevelValue}>
                            {internalLevelValue?.toFixed(1) ?? "-"}
                          </TableCell>
                        ),
                      )}
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-gray-500">
                  Unavailable for this chart.
                </div>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion className="bg-zinc-100/60" defaultExpanded>
            <AccordionSummary expandIcon={<MdiChevronDown />}>
              Song Details
            </AccordionSummary>
            <AccordionDetails>
              <Table size="small" className="mb-4">
                <TableHead>
                  <TableRow>
                    <TableCell width="100px">Category</TableCell>
                    <TableCell width="200px">{sheet.category}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>BPM</TableCell>
                    <TableCell>{sheet.bpm}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>Song Artist</TableCell>
                    <TableCell>{sheet.artist}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell>Chart Designer</TableCell>
                    <TableCell>{sheet.noteDesigner}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell colSpan={2}>Notes</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Tap</TableCell>
                    <TableCell>{sheet.noteCounts.tap ?? 0}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Hold</TableCell>
                    <TableCell>{sheet.noteCounts.hold ?? 0}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Slide</TableCell>
                    <TableCell>{sheet.noteCounts.slide ?? 0}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Touch</TableCell>
                    <TableCell>{sheet.noteCounts.touch ?? 0}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Break</TableCell>
                    <TableCell>{sheet.noteCounts.break ?? 0}</TableCell>
                  </TableRow>

                  <TableRow className="bg-gray-1">
                    <TableCell className="pl-8">— Total</TableCell>
                    <TableCell>
                      {sheet.noteCounts.total?.toLocaleString("en-US")}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>Region Availability</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {Object.entries(sheet.regions).map(
                          ([region, available]) => (
                            <Chip
                              size="small"
                              key={region}
                              label={region}
                              className={clsx(
                                "uppercase font-mono text-white font-bold select-none",
                                available ? "!bg-green-500" : "!bg-red-500",
                              )}
                            />
                          ),
                        )}{" "}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <Button
                href={
                  "https://arcade-songs.zetaraku.dev/maimai/song/?id=" +
                  encodeURIComponent(sheet.songId)
                }
                target="_blank"
                variant="outlined"
                className="!normal-case"
                startIcon={<IconMdiOpenInNew />}
              >
                <span>View Song on&nbsp;</span>
                <span className="text-xs tracking-tighter">
                  arcade-songs.zetaraku.dev
                </span>
              </Button>

              <div className="mt-4 text-xs text-gray-500 text-right">
                Data from{" "}
                <a
                  href="https://arcade-songs.zetaraku.dev"
                  rel="noreferrer"
                  target="_blank"
                  className="tracking-tighter"
                >
                  arcade-songs.zetaraku.dev
                </a>
              </div>
            </AccordionDetails>
          </Accordion>

          <Accordion className="bg-zinc-100/60">
            <AccordionSummary expandIcon={<MdiChevronDown />}>
              Achievement → Rating
            </AccordionSummary>

            <AccordionDetails>
              <Table className="tabular-nums !font-mono" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="100px">Achv</TableCell>
                    <TableCell width="50px">Rating</TableCell>
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
                          <div className={clsx("flex items-center font-sans")}>
                            <DXRank rank={rating.rating.rank} className="h-8" />
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
            </AccordionDetails>
          </Accordion>
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
