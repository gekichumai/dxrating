import { intlFormatDistance } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const useTime = (
  time?: string,
  length: "short" | "normal" = "normal",
) => {
  const { i18n } = useTranslation();
  return useMemo(() => {
    try {
      if (!time) throw new Error("useTime: time is undefined");

      const date = new Date(time);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }

      const dateString = date.toLocaleString(i18n.language);
      const relativeTime = intlFormatDistance(date, new Date());

      if (length === "short") {
        return relativeTime;
      }
      return `${dateString} (${relativeTime})`;
    } catch {
      return "unknown";
    }
  }, [time, i18n.language]);
};
