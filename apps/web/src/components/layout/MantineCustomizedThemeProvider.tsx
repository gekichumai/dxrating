import { createTheme, MantineProvider } from "@mantine/core";
import { FC, PropsWithChildren, useMemo } from "react";

import { useVersionTheme } from "../../utils/useVersionTheme";

export const MantineCustomizedThemeProvider: FC<PropsWithChildren<object>> = ({
  children,
}) => {
  const versionTheme = useVersionTheme();

  const theme = useMemo(
    () =>
      createTheme({
        fontFamily: "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
        radius: {
          xs: "4px",
          sm: "8px",
          md: "12px",
          lg: "16px",
          xl: "20px",
        },
        primaryColor: versionTheme.accentColor.mantine,
        respectReducedMotion: true,
      }),
    [versionTheme],
  );

  return <MantineProvider theme={theme}>{children}</MantineProvider>;
};
