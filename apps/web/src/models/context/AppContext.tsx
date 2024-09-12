import { VersionEnum } from "@gekichumai/dxdata";
import {
  FC,
  PropsWithChildren,
  createContext,
  useEffect,
  useMemo,
} from "react";
import { useLocalStorage } from "react-use";

import { DXRatingPlugin } from "../../utils/capacitor/plugin/wrap";

export type AppContext = AppContextStates & AppContextFns;

export type DXVersion = "festival-plus" | "buddies" | "buddies-plus" | "prism";

export type Region = "jp" | "intl" | "cn" | "_generic";

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  "festival-plus": VersionEnum.FESTiVALPLUS,
  buddies: VersionEnum.BUDDiES,
  "buddies-plus": VersionEnum.BUDDiESPLUS,
  prism: VersionEnum.PRiSM,
};

export interface AppContextStates {
  version: DXVersion;
  region: Region;
}

export interface AppContextFns {
  setVersionAndRegion: (version: DXVersion, region: Region) => void;
}

export const AppContext = createContext<AppContext>({
  version: "prism",
  region: "_generic",
  setVersionAndRegion: () => {
    throw new Error("AppContext not initialized");
  },
});

function getDefaultAppContext(): AppContextStates {
  return {
    version: "prism",
    region: "_generic",
  };
}

export const AppContextProvider: FC<PropsWithChildren<object>> = ({
  children,
}) => {
  const [state, setState] = useLocalStorage<AppContextStates>(
    "app-context",
    getDefaultAppContext(),
  );

  const value = useMemo<AppContext>(
    () => ({
      version: state!.version,

      region: state!.region ?? "jp",
      setVersionAndRegion: (version, region) => setState({ version, region }),
    }),
    [state, setState],
  );

  useEffect(() => {
    console.info("AppContextProvider: userPreferenceDidChanged", value.version);
    DXRatingPlugin.userPreferenceDidChanged({
      version: value.version,
    });
  }, [value.version]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
