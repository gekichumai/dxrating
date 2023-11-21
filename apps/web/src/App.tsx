import { CircularProgress, Tab, Tabs } from "@mui/material";
import { useTransition } from "react";
import { useLocalStorage } from "react-use";
import { FadedImage } from "./components/FadedImage";
import { RatingCalculator } from "./pages/RatingCalculator";
import { SheetList } from "./pages/SheetList";

export const App = () => {
  const [tab, setTab] = useLocalStorage<"search" | "rating">(
    "tab-selection",
    "search",
  );
  const [isPending, startTransition] = useTransition();

  return (
    <div className="h-full w-full relative">
      <img
        src="https://dxrating-assets.imgg.dev/images/background.jpg"
        className="fixed inset-0 h-full w-full z-[-1] object-cover object-center"
      />
      <div className="h-full w-full">
        <div className="w-full flex flex-col items-center justify-center text-white text-2xl font-bold gap-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8 bg-gradient-linear-[(to_bottom,_#c8a8f9,_#c8a8f9_env(safe-area-inset-top),_#c8a8f900)]">
          <FadedImage
            src="https://dxrating-assets.imgg.dev/images/festivalplus.png"
            className="aspect-h-269 aspect-w-133 h-32"
            draggable={false}
          />
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
          <CircularProgress />
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
