import { ActionIcon, Menu } from "@mantine/core";
import { FC, PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

import { startViewTransition } from "../../../utils/startViewTransition";

import MdiCheck from "~icons/mdi/check";
import MdiTranslate from "~icons/mdi/translate";

const LocaleSelectorItem: FC<
  PropsWithChildren<{ locale: string; selected?: boolean }>
> = ({ locale, selected, children }) => {
  const { i18n } = useTranslation();
  return (
    <Menu.Item
      onClick={() => {
        startViewTransition(() => {
          i18n.changeLanguage(locale);
        });
      }}
      leftSection={
        selected ? <MdiCheck className="size-4" /> : <div className="w-4" />
      }
    >
      {children}
    </Menu.Item>
  );
};

const LOCALES = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "zh-Hant", label: "繁體中文" },
] as const;

export const LocaleSelector = () => {
  const { i18n } = useTranslation();

  return (
    <Menu shadow="md" width={140}>
      <Menu.Target>
        <ActionIcon>
          <MdiTranslate />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {LOCALES.map(({ value, label }) => (
          <LocaleSelectorItem
            locale={value}
            selected={i18n.language === value}
            key={value}
          >
            {label}
          </LocaleSelectorItem>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
