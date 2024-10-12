import { Button, Menu } from "@mui/material";
import { FC, useId, useState } from "react";

import { ExportToJSONMenuItem } from "./export/ExportToJSONMenuItem";

export const ExportMenu: FC = () => {
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
        variant="menu"
      >
        <ExportToJSONMenuItem />
      </Menu>
    </>
  );
};
