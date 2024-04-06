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
import { Geiger } from "react-geiger";
import { SideEffector } from "./components/global/SideEffector";
import { RatingCalculatorContextProvider } from "./models/RatingCalculatorContext";

if (import.meta.env.PROD) {
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
    tracesSampleRate: 0.01,
    ignoreErrors: [
      /// START: https://gist.github.com/Chocksy/e9b2cdd4afc2aadc7989762c4b8b495a
      "top.GLOBALS",
      // See: http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      "http://tt.epicplay.com",
      "Can't find variable: ZiteReader",
      "jigsaw is not defined",
      "ComboSearch is not defined",
      "http://loading.retry.widdit.com/",
      "atomicFindClose",
      // Facebook borked
      "fb_xd_fragment",
      // ISP "optimizing" proxy - `Cache-Control: no-transform` seems to
      // reduce this. (thanks @acdha)
      // See http://stackoverflow.com/questions/4113268
      "bmi_SafeAddOnload",
      "EBCallBackMessageReceived",
      // See http://toolbar.conduit.com/Developer/HtmlAndGadget/Methods/JSInjection.aspx
      "conduitPage",
      // Avast extension error
      "_avast_submit",
      /// END

      /// START: Customized ones
      "vivoNewsDetailPage",
      "removeAD",
      "ucbrowser",
      /// END
    ],
    denyUrls: [
      // Google Adsense
      /pagead\/js/i,
      // Facebook flakiness
      /graph\.facebook\.com/i,
      // Facebook blocked
      /connect\.facebook\.net\/en_US\/all\.js/i,
      // Woopra flakiness
      /eatdifferent\.com\.woopra-ns\.com/i,
      /static\.woopra\.com\/js\/woopra\.js/i,
      // Chrome extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Other plugins
      /127\.0\.0\.1:4001\/isrunning/i, // Cacaoweb
      /webappstoolbarba\.texthelp\.com\//i,
      /metrics\.itunes\.apple\.com\.edgesuite\.net\//i,
    ],
  });
} else {
  console.log("Not in production, skipping Sentry initialization");
}

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
      lookupQuerystring: "locale",
      lookupLocalStorage: "dxrating-locale",
      lookupSessionStorage: "dxrating-locale",
      lookupCookie: "dxrating-locale",
      caches: ["localStorage"],
      convertDetectedLanguage(lng) {
        if (["en", "ja", "zh-Hans", "zh-Hant"].includes(lng)) {
          // Use the exact language code
          return lng;
        }
        if (lng === "zh-CN") {
          // Fallback to simplified Chinese
          return "zh-Hans";
        }
        if (
          ["zh-TW", "zh-HK", "zh-MO", "zh-SG"].some((v) => lng.startsWith(v))
        ) {
          // Fallback to traditional Chinese
          return "zh-Hant";
        }
        if (lng.startsWith("zh")) {
          // Fallback to simplified Chinese
          return "zh-Hans";
        }
        return "en";
      },
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
        <RatingCalculatorContextProvider>
          <SideEffector />
          <CustomizedToaster />
          <Geiger renderTimeThreshold={10}>
            <App />
          </Geiger>
        </RatingCalculatorContextProvider>
      </VersionCustomizedThemeProvider>
    </AppContextProvider>
  </React.StrictMode>,
);
