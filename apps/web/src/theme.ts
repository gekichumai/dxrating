import { VersionEnum } from "@gekichumai/dxdata";

export interface Theme {
  background: string;
  logo: string;
  accentColor: string;
}

export const THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background:
      "https://shama.dxrating.net/images/background/festival-plus.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/festival-plus.jpg",
    accentColor: "#c8a8f9",
  },
  [VersionEnum.BUDDiES]: {
    background: "https://shama.dxrating.net/images/background/buddies.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/buddies.jpg",
    accentColor: "#FAAE29",
  },
};
