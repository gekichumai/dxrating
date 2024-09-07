import { usePostHog } from "posthog-js/react";
import { FC, memo, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../models/context/AuthContext";
import { useRatingCalculatorContext } from "../../models/context/RatingCalculatorContext";
import { useSheets } from "../../songs";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { importFromNETRecords } from "../rating/io/import/importFromNETRecords";

const SideEffectorThemeMeta: FC = () => {
  const versionTheme = useVersionTheme();
  useEffect(() => {
    console.info("[theme] Theme changed to", versionTheme);

    document.body.style.backgroundColor = versionTheme.accentColor.hex;

    document.head
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", versionTheme.accentColor.hex);

    document.head
      .querySelector('meta[name="msapplication-TileColor"]')
      ?.setAttribute("content", versionTheme.accentColor.hex);

    document.head
      .querySelector('link[rel="mask-icon"]')
      ?.setAttribute("color", versionTheme.accentColor.hex);
  }, [versionTheme]);

  return null;
};

const SideEffectorLocaleMeta: FC = () => {
  const { i18n } = useTranslation();
  useEffect(() => {
    console.info("[i18n] Language detected as " + i18n.language);
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return null;
};

const SideEffectorAutoImportRating: FC = () => {
  const { data: sheets } = useSheets();
  const { modifyEntries } = useRatingCalculatorContext();

  useEffect(() => {
    if (!sheets) return;
    const mode = (() => {
      try {
        const mode = localStorage.getItem("rating-auto-import-from-net");
        if (!mode) return "disabled";

        const parsed = JSON.parse(mode);
        if (parsed === "merge") return "merge";
        if (parsed === "replace") return "replace";
        if (parsed === true) return "replace";
        return "disabled";
      } catch {
        return "disabled";
      }
    })() as "merge" | "replace" | "disabled";

    if (mode === "disabled") return;

    importFromNETRecords(sheets, modifyEntries, mode);
  }, [!!sheets]);

  return null;
};

const SideEffectorAuth: FC = () => {
  const { session } = useAuth();
  const posthog = usePostHog();

  useEffect(() => {
    if (session) {
      posthog?.identify(session?.user.id, {
        email: session?.user.email,
      });
    } else {
      posthog?.reset();
    }
  }, [session]);

  return null;
};

export const SideEffector: FC = memo(() => {
  return (
    <>
      <SideEffectorThemeMeta />
      <SideEffectorLocaleMeta />
      <SideEffectorAutoImportRating />
      <SideEffectorAuth />
    </>
  );
});
