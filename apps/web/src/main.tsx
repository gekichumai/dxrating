import { ThemeProvider, createTheme } from "@mui/material";
import "@unocss/reset/tailwind-compat.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "virtual:uno.css";
import { App } from "./App";
import "./index.css";

const theme = createTheme({
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
