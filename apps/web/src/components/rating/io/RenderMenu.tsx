import { Button, Menu } from "@mui/material";
import { FC, useId, useState } from "react";
import { Entry } from "../../../pages/RatingCalculator";
import { RenderToOneShotImageMenuItem } from "./RenderToOneShotImageMenuItem";

export const RenderMenu: FC<{
  calculatedEntries: Entry[];
}> = ({ calculatedEntries }) => {
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
        Render...
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
        <RenderToOneShotImageMenuItem calculatedEntries={calculatedEntries} />
      </Menu>
    </>
  );
};
