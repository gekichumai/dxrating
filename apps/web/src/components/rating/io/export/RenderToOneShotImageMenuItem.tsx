import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { FC } from "react";
import IconMdiImage from "~icons/mdi/image";
import { Entry } from "../../../../pages/RatingCalculator";

export const RenderToOneShotImageMenuItem: FC<{
  calculatedEntries: Entry[];
}> = () => {
  return (
    <>
      <MenuItem disabled>
        <ListItemIcon>
          <IconMdiImage />
        </ListItemIcon>
        <ListItemText
          primary="Render as OneShot Image..."
          secondary="Coming soon"
        />
      </MenuItem>
    </>
  );
};
