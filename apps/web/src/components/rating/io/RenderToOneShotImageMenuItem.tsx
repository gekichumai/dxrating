import {
  Dialog,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { FC, useState } from "react";
import IconMdiImage from "~icons/mdi/image";
import { Entry } from "../../../pages/RatingCalculator";
import { OneShotImage } from "../../OneShotImage";

export const RenderToOneShotImageMenuItem: FC<{
  entries: Entry[];
}> = ({ entries }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth={false}>
        <DialogTitle>Export as OneShot Image</DialogTitle>
        <DialogContent>
          <OneShotImage entries={entries} />
        </DialogContent>
      </Dialog>

      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
      >
        <ListItemIcon>
          <IconMdiImage />
        </ListItemIcon>
        <ListItemText>Render as OneShot Image...</ListItemText>
      </MenuItem>
    </>
  );
};
