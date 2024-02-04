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
} from "../../models/context/AppContext";
import { useAppContext } from "../../models/context/useAppContext";
import { WebpSupportedImage } from "./WebpSupportedImage";

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
      {VERSIONS.map((v) => (
        <MenuItem
          value={v}
          key={v}
          className="flex justify-center items-center"
        >
          <WebpSupportedImage
            src={`https://shama.dxrating.net/images/version-logo/${v}.png`}
            className="h-auto w-56 touch-callout-none"
            draggable={false}
          />
        </MenuItem>
      ))}
      <ListItem className="flex justify-center items-center text-sm">
        <div className="flex justify-center items-start max-w-[18rem] text-gray-500">
          <MdiInformation className="mr-2 shrink-0 mt-0.5" />
          <span className="whitespace-normal">
            {t("settings:version.info")}
          </span>
        </div>
      </ListItem>
    </StyledVersionSelect>
  );
};
