import { VersionEnum } from "@gekichumai/dxdata";
import { FC, PropsWithChildren, createContext, useMemo } from "react";
import { useLocalStorage } from "react-use";

export type AppContext = AppContextStates & AppContextFns;

export type DXVersion = "festival-plus" | "buddies";

export const DXVersionToDXDataVersionEnumMap: Record<DXVersion, VersionEnum> = {
  "festival-plus": VersionEnum.FESTiVALPLUS,
  buddies: VersionEnum.BUDDiES,
};

export interface AppContextStates {
  version: DXVersion;
}

export interface AppContextFns {
  setVersion: (version: "festival-plus" | "buddies") => void;
}

export const AppContext = createContext<AppContext>({
  version: "festival-plus",
  setVersion: () => {
    throw new Error("AppContext not initialized");
  },
});

export const AppContextProvider: FC<PropsWithChildren<object>> = ({
  children,
}) => {
  const [state, setState] = useLocalStorage<AppContextStates>("app-context", {
    version: "festival-plus",
  });

  const value = useMemo<AppContext>(
    () => ({
      version: state!.version,
      setVersion: (version) => setState({ ...state, version }),
    }),
    [state, setState],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
