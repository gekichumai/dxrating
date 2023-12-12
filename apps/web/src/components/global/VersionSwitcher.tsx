import { ListSubheader, MenuItem, Select, styled } from "@mui/material";
import { FC } from "react";
import {
  DXVersion,
  DXVersionToDXDataVersionEnumMap,
} from "../../models/context/AppContext";
import { useAppContext } from "../../models/context/useAppContext";

const VERSIONS = Object.keys(DXVersionToDXDataVersionEnumMap) as DXVersion[];

const StyledVersionSelect = styled(Select)(({ theme }) => ({
  "&": {
    borderRadius: 12,
    overflow: "hidden",
  },
  "& .MuiSelect-select": {
    padding: theme.spacing(1, 2),
  },
  "&:before": {
    display: "none",
  },
}));

export const VersionSwitcher: FC = () => {
  const { version, setVersion } = useAppContext();
  const disabled = false;

  return disabled ? (
    <div className="flex justify-center items-center">
      <img
        src={`https://dxrating-assets.imgg.dev/images/version-logo/${version}.png`}
        className="h-32 w-auto"
        draggable={false}
      />
    </div>
  ) : (
    <StyledVersionSelect
      value={version}
      variant="filled"
      onChange={(e) => setVersion(e.target.value as DXVersion)}
    >
      <ListSubheader>Select DXData Version</ListSubheader>
      {VERSIONS.map((v) => (
        <MenuItem
          value={v}
          key={v}
          className="flex justify-center items-center"
        >
          <img
            src={`https://dxrating-assets.imgg.dev/images/version-logo/${v}.png`}
            className="h-32 w-auto"
            draggable={false}
          />
        </MenuItem>
      ))}
    </StyledVersionSelect>
  );
};
