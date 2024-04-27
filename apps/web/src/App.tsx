import { CircularProgress, Tab, Tabs } from "@mui/material";
import { usePostHog } from "posthog-js/react";
import { Suspense, useCallback, useEffect, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useEffectOnce, useLocalStorage } from "react-use";

import { OverscrollBackgroundFiller } from "./components/global/OverscrollBackgroundFiller";
import { VersionRegionSwitcher } from "./components/global/preferences/VersionRegionSwitcher";
import { WebpSupportedImage } from "./components/global/WebpSupportedImage";
import { TopBar } from "./components/layout/TopBar";
import { RatingCalculator } from "./pages/RatingCalculator";
import { SheetList } from "./pages/SheetList";
import { useVersionTheme } from "./utils/useVersionTheme";

const APP_TABS_VALUES = ["search", "rating"] as const;
type AppTabsValuesType = (typeof APP_TABS_VALUES)[number];

const DEFAULT_TAB = "search" as AppTabsValuesType;

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
);

export const App = () => {
  const posthog = usePostHog();
  const { t, i18n } = useTranslation(["root"]);
  const versionTheme = useVersionTheme();
  const [tab, setTab] = useLocalStorage<AppTabsValuesType>(
    "tab-selection",
    DEFAULT_TAB,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    posthog?.capture("tab_switched", { tab });
  }, [tab]);

  useEffect(() => {
    console.info("[i18n] Language detected as " + i18n.language);
  }, [i18n.language]);

  const userInteractedSetTab = useCallback(
    (newTab: AppTabsValuesType) => {
      startTransition(() => {
        setTab(newTab);

        window.history.pushState(
          {},
          "",
          `/${newTab}${window.location.search}${window.location.hash}`,
        );
      });
    },
    [setTab, startTransition],
  );

  const updateTabFromPath = useCallback(() => {
    const url = new URL(window.location.href);
    const tab = url.pathname.slice(1) as AppTabsValuesType;
    if (APP_TABS_VALUES.includes(tab)) {
      setTab(tab);
    }
  }, [setTab]);

  useEffectOnce(() => {
    updateTabFromPath();
  });

  useEffect(() => {
    const ln = () => {
      updateTabFromPath();
    };
    window.addEventListener("popstate", ln);

    return () => {
      window.removeEventListener("popstate", ln);
    };
  }, [updateTabFromPath]);

  return (
    <div className="h-full w-full relative">
      <WebpSupportedImage
        src={versionTheme.background}
        alt="background"
        className="fixed inset-0 h-full-lvh w-full z-[-1] object-cover object-center select-none touch-callout-none"
        draggable={false}
      />

      <div className="h-full w-full relative">
        <OverscrollBackgroundFiller />
        <TopBar />
        <div
          className="w-full flex flex-col items-center justify-center text-white text-2xl font-bold gap-4 pt-4 pb-4"
          style={{
            backgroundImage: `linear-gradient(
    to bottom,
    ${versionTheme.accentColor},
    ${versionTheme.accentColor} env(safe-area-inset-top),
    ${versionTheme.accentColor}00
  )
`,
          }}
        >
          <VersionRegionSwitcher />
          <Tabs
            value={tab}
            onChange={(_, v) => {
              userInteractedSetTab(v);
            }}
            classes={{
              root: "rounded-xl bg-zinc-900/10 !min-h-2.5rem",
              indicator: "!h-full !rounded-lg z-0",
            }}
          >
            {APP_TABS_VALUES.map((v) => (
              <Tab
                key={v}
                label={t(`root:pages.${v}.title`)}
                classes={{
                  selected: "!text-black/90 font-bold",
                  root: "!rounded-lg transition-colors z-1 !py-0 !min-h-2.5rem !h-2.5rem",
                }}
                value={v}
              />
            ))}
          </Tabs>
        </div>
        <Suspense fallback={fallbackElement}>
          {isPending
            ? fallbackElement
            : {
                search: <SheetList />,
                // recent: <RecentPage />,
                rating: <RatingCalculator />,
              }[tab ?? DEFAULT_TAB]}
        </Suspense>
      </div>
    </div>
  );
};
