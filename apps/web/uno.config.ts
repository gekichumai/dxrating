// uno.config.ts
import { defineConfig } from "unocss";

export default defineConfig({
  rules: [["font-rounded", { "font-family": "Torus" }]],
  shortcuts: {
    "flex-container":
      "flex flex-col items-center justify-center p-4 gap-4 max-w-7xl mx-auto",
    "chunks-horizontal-2":
      "flex flex-col md:flex-row items-center justify-center gap-2 w-full",
  },
});
