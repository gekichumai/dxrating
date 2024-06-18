import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.dxrating",
  appName: "DXRating",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
