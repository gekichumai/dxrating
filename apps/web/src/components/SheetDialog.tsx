import {
  Alert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { FC, useMemo } from "react";
import { FlattenedSheet } from "../songs";
import { calculateRating } from "../utils/rating";
import { DXRank } from "./DXRank";
import { SheetImage, SheetTitle } from "./SheetCard";

const PRESET_ACHIEVEMENT_RATES = [
  100.5, 100.4999, 100, 99.9999, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50,
];

export const SheetDialog: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const ratings = useMemo(() => {
    return PRESET_ACHIEVEMENT_RATES.map((rate) => ({
      achievementRate: rate,
      rating: calculateRating(sheet.internalLevelValue, rate),
    }));
  }, [sheet]);

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-center">
        <SheetImage name={sheet.imageName} />

        <div className="flex-1" />

        <div className="text-4xl text-zinc-900/60 leading-none">
          {sheet.internalLevelValue.toFixed(1)}
        </div>
      </div>

      <SheetTitle
        title={sheet.title}
        difficulty={sheet.difficulty}
        type={sheet.type}
        className="text-lg font-bold"
      />

      <Alert severity="info" className="text-sm">
        <div className="flex items-center gap-1">
          <span className="font-bold">Target Version:</span>
          <span>FESTiVAL PLUS</span>
        </div>
      </Alert>

      <Table className="tabular-nums !font-mono" size="small">
        <TableHead>
          <TableRow>
            <TableCell>Achv</TableCell>
            <TableCell>Rating</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ratings.map((rating, i) => {
            const nextRating = i === ratings.length - 1 ? null : ratings[i + 1];

            return (
              <TableRow
                key={rating.achievementRate}
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                <TableCell component="th" scope="row">
                  <div className="flex items-center font-sans">
                    <DXRank rank={rating.rating.rank} className="h-8" />
                    <span>{rating.achievementRate.toFixed(4)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="relative font-sans">
                    <span className="font-bold">
                      {rating.rating.ratingAwardValue}
                    </span>

                    {nextRating && (
                      <div className="absolute -bottom-5 -left-1 px-1 text-xs text-gray-500 bg-zinc-100 shadow-[0_0_0_1px_var(--un-shadow-color)] shadow-zinc-300/80 rounded-xs">
                        ↑ +
                        {rating.rating.ratingAwardValue -
                          nextRating.rating.ratingAwardValue}
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
  );
};
