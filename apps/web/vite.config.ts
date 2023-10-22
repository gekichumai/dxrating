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
  },
});
