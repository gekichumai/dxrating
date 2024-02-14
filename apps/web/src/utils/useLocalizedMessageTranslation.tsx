import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export const useLocalizedMessageTranslation = () => {
  const { i18n } = useTranslation();

  return useCallback(
    (message?: Record<string, string> | null) => {
      if (!message) return undefined;

      if (message[i18n.language]) return message[i18n.language];

      if (i18n.options.fallbackLng) {
        const fallbacks = Array.isArray(i18n.options.fallbackLng)
          ? i18n.options.fallbackLng
          : [i18n.options.fallbackLng];
        for (const fallback of fallbacks) {
          if (message[fallback]) return message[fallback];
        }
      }

      if (Object.keys(message).length === 0) return undefined;

      return message[Object.keys(message)[0]];
    },
    [i18n.language, i18n.options.fallbackLng],
  );
};
