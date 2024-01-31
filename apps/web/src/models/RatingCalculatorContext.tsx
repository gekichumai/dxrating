import { createContext, useContext } from "react";
import { ListActions } from "react-use/lib/useList";
import { PlayEntry } from "../components/rating/RatingCalculatorAddEntryForm";

export interface RatingCalculatorContext {
  entries?: PlayEntry[];
  modifyEntries: ListActions<PlayEntry>;
}

export const RatingCalculatorContext = createContext<RatingCalculatorContext>({
  entries: [],
  modifyEntries: {} as ListActions<PlayEntry>,
});

export const RatingCalculatorContextProvider = RatingCalculatorContext.Provider;

export const useRatingCalculatorContext = () => {
  const context = useContext(RatingCalculatorContext);
  if (!context) {
    throw new Error("Missing RatingCalculatorContextProvider");
  }
  return context;
};
