import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { FC } from "react";
import toast from "react-hot-toast";

import { useRatingCalculatorContext } from "../../../../models/context/RatingCalculatorContext";
import {
  RatingCalculatorEntry,
  useRatingEntries,
} from "../../useRatingEntries";

import IconMdiFile from "~icons/mdi/file";

const saveAsJsonFile = (data: string) => {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const name = `dxrating.export-${new Date().toISOString()}.json`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);

  toast.success("Exported as " + name);
};

export const ExportToJSONMenuItem: FC = () => {
  const { entries } = useRatingCalculatorContext();
  const { b15Entries, b35Entries } = useRatingEntries();
  return (
    <>
      <MenuItem
        onClick={() => {
          saveAsJsonFile(JSON.stringify(entries));
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>Export JSON (All Records)</ListItemText>
      </MenuItem>

      <MenuItem
        onClick={() => {
          const preprocess = (entry: RatingCalculatorEntry) => ({
            sheetId: entry.sheetId,
            achievementRate: entry.achievementRate,
          });

          const data = JSON.stringify([
            ...b35Entries.map(preprocess),
            ...b15Entries.map(preprocess),
          ]);
          saveAsJsonFile(data);
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>Export JSON (Only B50 Records)</ListItemText>
      </MenuItem>
    </>
  );
};
