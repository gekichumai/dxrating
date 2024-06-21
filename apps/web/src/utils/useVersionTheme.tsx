import { VersionEnum } from "@gekichumai/dxdata";

import { DXVersionToDXDataVersionEnumMap } from "../models/context/AppContext";
import { useAppContext } from "../models/context/useAppContext";
import { VERSION_THEME } from "../theme";

export const useVersionTheme = () => {
  const { version } = useAppContext();
  const theme =
    VERSION_THEME[DXVersionToDXDataVersionEnumMap[version]] ??
    VERSION_THEME[VersionEnum.BUDDiES];

  return theme;
};
