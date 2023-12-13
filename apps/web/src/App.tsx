import { CircularProgress, Tab, Tabs } from "@mui/material";
import { useTransition } from "react";
import { useLocalStorage } from "react-use";
import { About } from "./components/global/About";
import { VersionSwitcher } from "./components/global/VersionSwitcher";
import { RatingCalculator } from "./pages/RatingCalculator";
import { SheetList } from "./pages/SheetList";
import { useVersionTheme } from "./utils/useVersionTheme";

export const App = () => {
  const versionTheme = useVersionTheme();
  const [tab, setTab] = useLocalStorage<"search" | "rating">(
    "tab-selection",
    "search",
  );
  const [isPending, startTransition] = useTransition();

  return (
    <div className="h-full w-full relative">
      <img
        src={versionTheme.background}
        className="fixed inset-0 h-full w-full z-[-1] object-cover object-center"
      />
      <div className="h-full w-full relative">
        <About />
        <div
          className="w-full flex flex-col items-center justify-center text-white text-2xl font-bold gap-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8"
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
          <VersionSwitcher />
          <Tabs
            value={tab}
            onChange={(_, v) => {
              startTransition(() => {
                setTab(v);
              });
            }}
            classes={{
              root: "rounded-full bg-zinc-900/10 !min-h-2.5rem",
              indicator: "!h-full !rounded-full z-0",
            }}
          >
            <Tab
              label="Search Charts"
              classes={{
                selected: "!text-white",
                root: "!rounded-full transition-colors z-1 px-1 !py-0 !min-h-2.5rem",
              }}
              value="search"
            />
            <Tab
              label="My Rating"
              classes={{
                selected: "!text-white",
                root: "!rounded-full transition-colors z-1 px-1 !py-0 !min-h-2.5rem",
              }}
              value="rating"
            />
          </Tabs>
        </div>
        {isPending ? (
          <div className="flex items-center justify-center h-50% w-full p-6">
            <CircularProgress size="2rem" disableShrink />
          </div>
        ) : (
          {
            search: <SheetList />,
            rating: <RatingCalculator />,
          }[tab ?? "search"]
        )}
      </div>
    </div>
  );
};
