import { VersionEnum } from "@gekichumai/dxdata";
import { DXVersionToDXDataVersionEnumMap } from "../models/context/AppContext";
import { useAppContext } from "../models/context/useAppContext";
import { THEME } from "../theme";

export const useVersionTheme = () => {
  const { version } = useAppContext();
  const theme =
    THEME[DXVersionToDXDataVersionEnumMap[version]] ??
    THEME[VersionEnum.FESTiVALPLUS];

  return theme;
};
