import { ListSubheader, MenuItem, Select, styled } from "@mui/material";
import { FC, useEffect } from "react";
import {
  DXVersion,
  DXVersionToDXDataVersionEnumMap,
} from "../../models/context/AppContext";
import { useAppContext } from "../../models/context/useAppContext";
import { useVersionTheme } from "../../utils/useVersionTheme";

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
  const versionTheme = useVersionTheme();
  const disabled = false;

  useEffect(() => {
    document.body.style.backgroundColor = versionTheme.accentColor;

    const themeColorMeta = document.querySelector(
      'meta[name="theme-color"]',
    ) as HTMLMetaElement;
    if (themeColorMeta) {
      themeColorMeta.content = versionTheme.accentColor;
    }
  }, [versionTheme]);

  return disabled ? (
    <div className="flex justify-center items-center">
      <img
        src={`https://dxrating-assets.imgg.dev/images/version-logo/${version}.png`}
        className="h-32 w-auto touch-callout-none"
        draggable={false}
      />
    </div>
  ) : (
    <StyledVersionSelect
      value={version}
      variant="filled"
      onChange={(e) => setVersion(e.target.value as DXVersion)}
      renderValue={(value) => (
        <img
          src={`https://dxrating-assets.imgg.dev/images/version-logo/${value}.png`}
          className="h-32 w-auto touch-callout-none"
          draggable={false}
        />
      )}
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
            className="h-auto w-56 touch-callout-none"
            draggable={false}
          />
        </MenuItem>
      ))}
    </StyledVersionSelect>
  );
};
