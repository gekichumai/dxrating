import { VersionEnum } from "@gekichumai/dxdata";

export interface Theme {
  background: string;
  logo: string;
  favicon: string;
  accentColor: string;
}

export const THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background:
      "https://shama.dxrating.net/images/background/festival-plus.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/festival-plus.png",
    favicon: "https://shama.dxrating.net/favicon/festival-plus-1024x.jpg",
    accentColor: "#c8a8f9",
  },
  [VersionEnum.BUDDiES]: {
    background: "https://shama.dxrating.net/images/background/buddies.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/buddies.png",
    favicon: "https://shama.dxrating.net/favicon/buddies-1024x.jpg",
    accentColor: "#FAAE29",
  },
};
