import {
  Dialog,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { FC, Suspense, lazy, useState } from "react";
import IconMdiImage from "~icons/mdi/image";
import { Entry } from "../../../pages/RatingCalculator";

const OneShotImage = lazy(() => import("../../OneShotImage"));

export const RenderToOneShotImageMenuItem: FC<{
  calculatedEntries: Entry[];
}> = ({ calculatedEntries }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth={false}>
        <DialogTitle>Export as OneShot Image</DialogTitle>
        <DialogContent>
          <Suspense fallback={<div>Loading...</div>}>
            <OneShotImage calculatedEntries={calculatedEntries} />
          </Suspense>
        </DialogContent>
      </Dialog>

      <MenuItem
        disabled={import.meta.env.PROD}
        onClick={() => {
          setOpen(true);
        }}
      >
        <ListItemIcon>
          <IconMdiImage />
        </ListItemIcon>
        <ListItemText
          primary="Render as OneShot Image..."
          secondary="鋭意制作中"
        />
      </MenuItem>
    </>
  );
};
