import { AppShell, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { CircularProgress } from "@mui/material";
import { Suspense } from "react";
import { Route, Router } from "wouter";

import { WebpSupportedImage } from "./components/global/WebpSupportedImage";
import { NavigationItems } from "./components/layout/NavigationItems";
import { TopBar } from "./components/layout/TopBar";
import { RatingCalculator } from "./pages/RatingCalculator";
import { SheetList } from "./pages/SheetList";
import { useVersionTheme } from "./utils/useVersionTheme";

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
);

export const App = () => {
  const [opened, { toggle }] = useDisclosure();
  const versionTheme = useVersionTheme();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <WebpSupportedImage
        src={versionTheme.background}
        alt="background"
        className="fixed inset-0 h-full-lvh w-full z-[-1] object-cover object-center select-none touch-callout-none"
        draggable={false}
      />

      <AppShell.Header
        style={{
          background: versionTheme.accentColor.hex,
        }}
        className="flex items-center px-4 gap-2"
      >
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />

        <TopBar />
      </AppShell.Header>

      <AppShell.Navbar p="md" className="backdrop-blur-lg bg-">
        <NavigationItems />
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense fallback={fallbackElement}>
          <Router>
            <Route path="/search">
              <SheetList />
            </Route>

            <Route path="/rating">
              <RatingCalculator />
            </Route>
          </Router>
        </Suspense>
      </AppShell.Main>
    </AppShell>
  );
};
