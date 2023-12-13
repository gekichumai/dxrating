import { useContext } from "react";
import { AppContext, DXVersionToDXDataVersionEnumMap } from "./AppContext";
import { VERSION_SLUG_MAP } from "@gekichumai/dxdata";

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
  const { version } = useAppContext();
  return VERSION_SLUG_MAP.get(DXVersionToDXDataVersionEnumMap[version])!;
};
