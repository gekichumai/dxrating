import clsx from "clsx";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";

import { VersionRegionSwitcher } from "../global/preferences/VersionRegionSwitcher";

import classes from "./NavigationItems.module.css";

const APP_TABS_VALUES = ["search", "rating"] as const;

export const NavigationItems: FC = () => {
  const [location] = useLocation();

  const { t } = useTranslation(["root"]);

  return (
    <>
      <VersionRegionSwitcher />

      <div className="flex flex-col">
        {APP_TABS_VALUES.map((link) => (
          <Link
            className={clsx(
              classes.link,
              location === `/${link}` ? "font-bold" : "font-medium",
            )}
            data-active={location === `/${link}` || undefined}
            key={link}
            href={`/${link}`}
          >
            {t(`root:pages.${link}.title`)}
          </Link>
        ))}
      </div>
    </>
  );
};
