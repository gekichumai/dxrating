import { VERSION_SLUG_MAP } from "@gekichumai/dxdata";
import { useContext } from "react";
import { AppContext, DXVersionToDXDataVersionEnumMap } from "./AppContext";

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("Missing AppContextProvider");
  }
  return context;
};

export const useAppContextDXDataVersion = () => {
  const { version } = useAppContext();
  return DXVersionToDXDataVersionEnumMap[version];
};

export const useAppContextSlugVersion = () => {
  const appVersion = useAppContextDXDataVersion();
  return VERSION_SLUG_MAP.get(appVersion)!;
};
