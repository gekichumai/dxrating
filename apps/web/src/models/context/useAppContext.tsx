import { useContext } from "react";
import { AppContext } from "./AppContext";

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("Missing AppContextProvider");
  }
  return context;
};
