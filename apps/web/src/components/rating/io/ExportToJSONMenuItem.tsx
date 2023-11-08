import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { FC } from "react";
import toast from "react-hot-toast";
import IconMdiFile from "~icons/mdi/file";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";

export const ExportToJSONMenuItem: FC<{
  entries: PlayEntry[];
}> = ({ entries }) => {
  return (
    <MenuItem
      onClick={() => {
        const data = JSON.stringify(entries);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const name = `dxrating.imgg.dev.export-${new Date().toISOString()}.json`;
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);

        toast.success("Exported as " + name);
      }}
    >
      <ListItemIcon>
        <IconMdiFile />
      </ListItemIcon>
      <ListItemText>Export as JSON</ListItemText>
    </MenuItem>
  );
};
