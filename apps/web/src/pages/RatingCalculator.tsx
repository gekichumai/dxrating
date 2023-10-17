import { useState } from "react";
import { useList } from "react-use";

interface PlayEntry {
  sheetId: string;
  achievementRate: number;
}

export const RatingCalculator = () => {
  const [entries, setEntries] = useList<PlayEntry>([]);
};
