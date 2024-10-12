import { Button, Divider, Menu } from "@mui/material";
import { FC, useId, useState } from "react";
import { ListActions } from "react-use/lib/useList";

import { PlayEntry } from "../RatingCalculatorAddEntryForm";

import { ImportFromAquaSQLiteListItem } from "./import/ImportFromAquaSQLiteListItem";
import { ImportFromDivingFishButtonListItem } from "./import/ImportFromDivingFishButtonListItem";
import { ImportFromJSONButtonListItem } from "./import/ImportFromJSONButtonListItem";
import { ImportFromNETRecordsListItem } from "./import/ImportFromNETRecordsListItem";

export const ImportMenu: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
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
        Import...
      </Button>

      <Menu
        id={`menu-${id}`}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": `button-${id}`,
          disabledItemsFocusable: true,
        }}
        variant="menu"
        disableAutoFocusItem
      >
        <ImportFromNETRecordsListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />
        <ImportFromDivingFishButtonListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />

        <Divider />

        <ImportFromJSONButtonListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />
        <ImportFromAquaSQLiteListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />
      </Menu>
    </>
  );
};
