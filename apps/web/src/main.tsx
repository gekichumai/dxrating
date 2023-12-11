import "@unocss/reset/tailwind-compat.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "virtual:uno.css";
import { App } from "./App";
import { CustomizedToaster } from "./components/global/CustomizedToaster";
import { VersionCustomizedThemeProvider } from "./components/layout/VersionCustomizedThemeProvider";
import "./index.css";
import { AppContextProvider } from "./models/context/AppContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppContextProvider>
      <VersionCustomizedThemeProvider>
        <CustomizedToaster />
        <App />
      </VersionCustomizedThemeProvider>
    </AppContextProvider>
  </React.StrictMode>,
);
