import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { FC, PropsWithChildren, useState } from "react";
import { useTranslation } from "react-i18next";

import { startViewTransition } from "../../../utils/startViewTransition";

import MdiCheck from "~icons/mdi/check";
import MdiTranslate from "~icons/mdi/translate";

const LocaleSelectorItem: FC<
  PropsWithChildren<{ locale: string; selected?: boolean }>
> = ({ locale, selected, children }) => {
  const { i18n } = useTranslation();
  return (
    <MenuItem
      selected={selected}
      onClick={() => {
        startViewTransition(() => {
          i18n.changeLanguage(locale);
        });
      }}
    >
      {selected && (
        <ListItemIcon>
          <MdiCheck />
        </ListItemIcon>
      )}
      {selected ? children : <ListItemText inset>{children}</ListItemText>}
    </MenuItem>
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
        <MdiTranslate />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {LOCALES.map(({ value, label }) => (
          <LocaleSelectorItem
            locale={value}
            selected={i18n.language === value}
            key={value}
          >
            {label}
          </LocaleSelectorItem>
        ))}
      </Menu>
    </>
  );
};
