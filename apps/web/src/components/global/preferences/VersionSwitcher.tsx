import {
  ListItem,
  ListSubheader,
  MenuItem,
  Select,
  styled,
} from "@mui/material";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import MdiInformation from "~icons/mdi/information";
import {
  DXVersion,
  DXVersionToDXDataVersionEnumMap,
} from "../../../models/context/AppContext";
import { useAppContext } from "../../../models/context/useAppContext";
import { VERSION_THEME } from "../../../theme";
import { WebpSupportedImage } from "../WebpSupportedImage";
import clsx from "clsx";

const VERSIONS = Object.entries(DXVersionToDXDataVersionEnumMap);

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
  const { t } = useTranslation(["settings"]);
  const { version, setVersion } = useAppContext();

  return (
    <StyledVersionSelect
      value={version}
      variant="filled"
      onChange={(e) => setVersion(e.target.value as DXVersion)}
      renderValue={(value) => (
        <WebpSupportedImage
          src={`https://shama.dxrating.net/images/version-logo/${value}.png`}
          className="h-32 w-auto touch-callout-none"
          draggable={false}
        />
      )}
    >
      <ListSubheader>{t("settings:version.select")}</ListSubheader>
      {VERSIONS.map(([dxVersion, versionEnum], i) => (
        <MenuItem
          value={dxVersion}
          key={dxVersion}
          className={clsx(
            "flex items-center gap-8 border-b border-solid border-gray-200",
            i === 0 && "border-t",
          )}
          disabled={VERSION_THEME[versionEnum]?.disabled ?? false}
        >
          <WebpSupportedImage
            src={`https://shama.dxrating.net/images/version-logo/${dxVersion}.png`}
            className="h-20 touch-callout-none object-contain w-42"
            draggable={false}
          />

          {/* <div className="flex-1" /> */}

          <div className="mr-2 opacity-70">{versionEnum}</div>
        </MenuItem>
      ))}
      <ListItem className="flex justify-center items-center text-sm">
        <div className="flex justify-center items-start max-w-[19rem] text-gray-500">
          <MdiInformation className="mr-2 shrink-0 mt-0.5" />
          <span className="whitespace-normal">
            {t("settings:version.info")}
          </span>
        </div>
      </ListItem>
    </StyledVersionSelect>
  );
};
