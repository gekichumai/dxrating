import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Json } from "../models/supabase.types";

// isAssumedRecord omits deep checks of the object's values but rather
// only checks if the value is an object and not null.
// it is not really a type guard but rather a type assumption.
function isAssumedRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null;
}

export const useLocalizedMessageTranslation = () => {
  const { i18n } = useTranslation();

  return useCallback(
    (message?: Record<string, string> | Json | null): string | null => {
      if (!message) return null;
      if (typeof message === "string") return message;
      if (!isAssumedRecord(message)) return null;

      if (message[i18n.language]) return message[i18n.language] ?? null;

      if (i18n.options.fallbackLng) {
        const fallbacks = Array.isArray(i18n.options.fallbackLng)
          ? i18n.options.fallbackLng
          : [i18n.options.fallbackLng];
        for (const fallback of fallbacks) {
          if (message[fallback]) return message[fallback] ?? null;
        }
      }

      if (Object.keys(message).length === 0) return null;

      return message[Object.keys(message)[0]] ?? null;
    },
    [i18n.language, i18n.options.fallbackLng],
  );
};
