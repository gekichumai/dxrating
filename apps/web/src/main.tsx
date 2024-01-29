import "@unocss/reset/tailwind-compat.css";
import LanguageDetector from "i18next-browser-languagedetector";
import React from "react";
import ReactDOM from "react-dom/client";
import "virtual:uno.css";
import { App } from "./App";
import { CustomizedToaster } from "./components/global/CustomizedToaster";
import { VersionCustomizedThemeProvider } from "./components/layout/VersionCustomizedThemeProvider";
import "./index.css";
import { AppContextProvider } from "./models/context/AppContext";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { i18nResources } from "./locales/locales";

import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://1e929f3c3b929a213436e3c4dff57140@o4506648698683392.ingest.sentry.io/4506648709627904",
  integrations: [
    new Sentry.BrowserTracing({
      // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
      tracePropagationTargets: [
        "localhost",
        /^https?:\/\/.*\.dxrating\.net/,
        /^https?:\/\/dxrating\.net/,
      ],
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.001, //  Capture 100% of the transactions
});

i18n
  .use(initReactI18next)
  .use(
    new LanguageDetector(null, {
      order: [
        "querystring",
        "cookie",
        "localStorage",
        "sessionStorage",
        "navigator",
      ],
      lookupLocalStorage: "dxrating-locale",
      lookupSessionStorage: "dxrating-locale",
      lookupCookie: "dxrating-locale",
      caches: ["localStorage"],
    }),
  )
  .init({
    resources: i18nResources,
    fallbackLng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
  });

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
