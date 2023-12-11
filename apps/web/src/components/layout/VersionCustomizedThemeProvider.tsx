import { ThemeProvider, createTheme } from "@mui/material";
import { FC, PropsWithChildren, useMemo } from "react";
import { useAppContext } from "../../models/context/useAppContext";

export const VersionCustomizedThemeProvider: FC<PropsWithChildren<object>> = ({
  children,
}) => {
  const appContext = useAppContext();

  const theme = useMemo(() => {
    return createTheme({
      shape: {
        borderRadius: 12,
      },
      typography: {
        fontFamily: "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
      },
      palette: {
        primary: {
          main: appContext.version === "festival-plus" ? "#855cb8" : "#eaa239",
        },
      },
    });
  }, [appContext.version]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
