import { VersionEnum } from "@gekichumai/dxdata";

export interface Theme {
  background: string;
  logo: string;
  accentColor: string;
}

export const THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background:
      "https://dxrating-assets.imgg.dev/images/background/festival-plus.jpg",
    logo: "https://dxrating-assets.imgg.dev/images/version-logo/festival-plus.jpg",
    accentColor: "#c8a8f9",
  },
  [VersionEnum.BUDDiES]: {
    background:
      "https://dxrating-assets.imgg.dev/images/background/buddies.jpg",
    logo: "https://dxrating-assets.imgg.dev/images/version-logo/buddies.jpg",
    accentColor: "#F69F04",
  },
};
