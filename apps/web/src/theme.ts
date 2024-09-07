import { VersionEnum } from "@gekichumai/dxdata";
import { MantineColor } from "@mantine/core";

export interface Theme {
  background: string;
  logo: string;
  favicon: string;
  accentColor: {
    hex: string;
    mantine: MantineColor;
  };
  disabled?: boolean;
}

export const VERSION_THEME: Record<string, Theme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background:
      "https://shama.dxrating.net/images/background/festival-plus.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/festival-plus.png",
    favicon: "https://shama.dxrating.net/favicon/festival-plus-1024x.jpg",
    accentColor: {
      hex: "#c8a8f9",
      mantine: "indigo",
    },
  },
  [VersionEnum.BUDDiES]: {
    background: "https://shama.dxrating.net/images/background/buddies.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/buddies.png",
    favicon: "https://shama.dxrating.net/favicon/buddies-1024x.jpg",
    accentColor: {
      hex: "#FAAE29",
      mantine: "orange",
    },
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: "https://shama.dxrating.net/images/background/buddies.jpg",
    logo: "https://shama.dxrating.net/images/version-logo/buddies-plus.png",
    favicon: "https://shama.dxrating.net/favicon/buddies-1024x.jpg",
    accentColor: {
      hex: "#FAAE29",
      mantine: "orange",
    },
  },
};
