import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useVersionTheme } from "../../utils/useVersionTheme";

const SideEffectorThemeMeta: FC = () => {
  const versionTheme = useVersionTheme();
  useEffect(() => {
    console.info("[theme] Theme changed to", versionTheme);

    document.body.style.backgroundColor = versionTheme.accentColor;

    document.head
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", versionTheme.accentColor);

    document.head
      .querySelector('meta[name="msapplication-TileColor"]')
      ?.setAttribute("content", versionTheme.accentColor);

    document.head
      .querySelector('link[rel="mask-icon"]')
      ?.setAttribute("color", versionTheme.accentColor);
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

export const SideEffector: FC = () => {
  return (
    <>
      <SideEffectorThemeMeta />
      <SideEffectorLocaleMeta />
    </>
  );
};
