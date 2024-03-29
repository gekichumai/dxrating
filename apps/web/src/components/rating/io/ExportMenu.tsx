import { Button, Menu } from "@mui/material";
import { FC, useId, useState } from "react";
import { Entry } from "../../../pages/RatingCalculator";
import { PlayEntry } from "../RatingCalculatorAddEntryForm";
import { ExportToJSONMenuItem } from "./export/ExportToJSONMenuItem";
import { RenderToOneShotImageMenuItem } from "./export/RenderToOneShotImageMenuItem";

export const ExportMenu: FC<{
  entries: PlayEntry[];
  calculatedEntries: Entry[];
}> = ({ entries, calculatedEntries }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const id = useId();

  return (
    <>
      <Button
        id={`button-${id}`}
        aria-controls={open ? `menu-${id}` : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
        variant="outlined"
      >
        Export...
      </Button>

      <Menu
        id={`menu-${id}`}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": `button-${id}`,
        }}
      >
        <ExportToJSONMenuItem entries={entries} />

        <RenderToOneShotImageMenuItem calculatedEntries={calculatedEntries} />
      </Menu>
    </>
  );
};
