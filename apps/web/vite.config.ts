import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    UnoCSS(),
    Icons({ compiler: "jsx", jsx: "react", autoInstall: true }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Auth tokens can be obtained from https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
      authToken: process.env.SENTRY_AUTH_TOKEN,
      reactComponentAnnotation: { enabled: true },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          lib: ["react", "@mui/material", "react-use", "@tanstack/react-table"],
          dxdata: ["@gekichumai/dxdata"],
        },
      },
    },
    sourcemap: process.env.VITE_BUILD_PLATFORM === "web",
  },
});
