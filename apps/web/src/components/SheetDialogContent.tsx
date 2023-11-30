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
import { FC, memo, useMemo } from "react";
import MdiChevronDown from "~icons/mdi/chevron-down";
import IconMdiSearchWeb from "~icons/mdi/search-web";
import IconMdiOpenInNew from "~icons/mdi/open-in-new";
import IconMdiSpotify from "~icons/mdi/spotify";
import IconMdiYouTube from "~icons/mdi/youtube";
import { FlattenedSheet } from "../songs";
import { calculateRating } from "../utils/rating";
import { DXRank } from "./DXRank";
import { SheetImage, SheetTitle } from "./SheetListItem";

const PRESET_ACHIEVEMENT_RATES = [
  100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50,
];

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

    return (
      <div className="flex flex-col gap-2 relative">
        <div className="flex items-center">
          <SheetImage name={sheet.imageName} size="large" />

          <div className="flex-1" />

          <div className="text-4xl text-zinc-900/60 leading-none">
            {sheet.internalLevelValue.toFixed(1)}
          </div>
        </div>

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

          <IconButton
            href={`https://music.apple.com/us/search?term=${sheet.title}`}
            target="_blank"
            className="inline-flex !text-[#ff2d55] !b-[#ff2d55] !font-bold"
          >
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
              x="0px"
              y="0px"
              width="361px"
              height="361px"
              viewBox="0 0 361 361"
              className="h-6 w-6"
              xmlSpace="preserve"
            >
              <g id="Layer_5"></g>
              {/* <g>
	<path class="st0" d="M360,112.61c0-4.3,0-8.6-0.02-12.9c-0.02-3.62-0.06-7.24-0.16-10.86c-0.21-7.89-0.68-15.84-2.08-23.64
		c-1.42-7.92-3.75-15.29-7.41-22.49c-3.6-7.07-8.3-13.53-13.91-19.14c-5.61-5.61-12.08-10.31-19.15-13.91
		c-7.19-3.66-14.56-5.98-22.47-7.41c-7.8-1.4-15.76-1.87-23.65-2.08c-3.62-0.1-7.24-0.14-10.86-0.16C255.99,0,251.69,0,247.39,0
		H112.61c-4.3,0-8.6,0-12.9,0.02c-3.62,0.02-7.24,0.06-10.86,0.16C80.96,0.4,73,0.86,65.2,2.27c-7.92,1.42-15.28,3.75-22.47,7.41
		c-7.07,3.6-13.54,8.3-19.15,13.91c-5.61,5.61-10.31,12.07-13.91,19.14c-3.66,7.2-5.99,14.57-7.41,22.49
		c-1.4,7.8-1.87,15.76-2.08,23.64c-0.1,3.62-0.14,7.24-0.16,10.86C0,104.01,0,108.31,0,112.61v134.77c0,4.3,0,8.6,0.02,12.9
		c0.02,3.62,0.06,7.24,0.16,10.86c0.21,7.89,0.68,15.84,2.08,23.64c1.42,7.92,3.75,15.29,7.41,22.49c3.6,7.07,8.3,13.53,13.91,19.14
		c5.61,5.61,12.08,10.31,19.15,13.91c7.19,3.66,14.56,5.98,22.47,7.41c7.8,1.4,15.76,1.87,23.65,2.08c3.62,0.1,7.24,0.14,10.86,0.16
		c4.3,0.03,8.6,0.02,12.9,0.02h134.77c4.3,0,8.6,0,12.9-0.02c3.62-0.02,7.24-0.06,10.86-0.16c7.89-0.21,15.85-0.68,23.65-2.08
		c7.92-1.42,15.28-3.75,22.47-7.41c7.07-3.6,13.54-8.3,19.15-13.91c5.61-5.61,10.31-12.07,13.91-19.14
		c3.66-7.2,5.99-14.57,7.41-22.49c1.4-7.8,1.87-15.76,2.08-23.64c0.1-3.62,0.14-7.24,0.16-10.86c0.03-4.3,0.02-8.6,0.02-12.9V112.61
		z"/>
</g> */}
              <g id="Glyph_2_">
                <g>
                  <path
                    className="st1"
                    d="M254.5,55c-0.87,0.08-8.6,1.45-9.53,1.64l-107,21.59l-0.04,0.01c-2.79,0.59-4.98,1.58-6.67,3
			c-2.04,1.71-3.17,4.13-3.6,6.95c-0.09,0.6-0.24,1.82-0.24,3.62c0,0,0,109.32,0,133.92c0,3.13-0.25,6.17-2.37,8.76
			c-2.12,2.59-4.74,3.37-7.81,3.99c-2.33,0.47-4.66,0.94-6.99,1.41c-8.84,1.78-14.59,2.99-19.8,5.01
			c-4.98,1.93-8.71,4.39-11.68,7.51c-5.89,6.17-8.28,14.54-7.46,22.38c0.7,6.69,3.71,13.09,8.88,17.82
			c3.49,3.2,7.85,5.63,12.99,6.66c5.33,1.07,11.01,0.7,19.31-0.98c4.42-0.89,8.56-2.28,12.5-4.61c3.9-2.3,7.24-5.37,9.85-9.11
			c2.62-3.75,4.31-7.92,5.24-12.35c0.96-4.57,1.19-8.7,1.19-13.26l0-116.15c0-6.22,1.76-7.86,6.78-9.08c0,0,88.94-17.94,93.09-18.75
			c5.79-1.11,8.52,0.54,8.52,6.61l0,79.29c0,3.14-0.03,6.32-2.17,8.92c-2.12,2.59-4.74,3.37-7.81,3.99
			c-2.33,0.47-4.66,0.94-6.99,1.41c-8.84,1.78-14.59,2.99-19.8,5.01c-4.98,1.93-8.71,4.39-11.68,7.51
			c-5.89,6.17-8.49,14.54-7.67,22.38c0.7,6.69,3.92,13.09,9.09,17.82c3.49,3.2,7.85,5.56,12.99,6.6c5.33,1.07,11.01,0.69,19.31-0.98
			c4.42-0.89,8.56-2.22,12.5-4.55c3.9-2.3,7.24-5.37,9.85-9.11c2.62-3.75,4.31-7.92,5.24-12.35c0.96-4.57,1-8.7,1-13.26V64.46
			C263.54,58.3,260.29,54.5,254.5,55z"
                    fill="currentColor"
                  />
                </g>
              </g>
              <g></g>
              <g></g>
              <g></g>
              <g></g>
              <g></g>
              <g></g>
            </svg>
          </IconButton>
        </div>

        <div>
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
