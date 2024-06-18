import { IconButton } from "@mui/material";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import { BUNDLE } from "../../utils/bundle";
import { useTime } from "../../utils/useTime";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { Logo } from "../global/Logo";
import { LocaleSelector } from "../global/preferences/LocaleSelector";
import { UserChip } from "../global/preferences/UserChip";
import { About } from "../global/site-meta/About";

import MdiShareVariant from "~icons/mdi/share-variant";

export const TopBar = () => {
  const updateTime = useTime(BUNDLE.buildTime, "short");
  const { t } = useTranslation(["root"]);
  const versionTheme = useVersionTheme();
  return (
    <div style={{ background: versionTheme.accentColor }}>
      <div className="flex items-center pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)]">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative">
          <Logo />
          <div className="text-xs text-black/50 leading-none">
            {BUNDLE.version ?? "unknown"} ({updateTime})
          </div>
        </div>

        <IconButton
          size="small"
          className="ml-2"
          onClick={() => {
            navigator.clipboard.writeText(
              t("root:share.copy-content", {
                link: window.location.href,
              }),
            );
            toast.success(t("root:share.copy-succeeded"), {
              id: "copy-page-link",
            });
          }}
        >
          <MdiShareVariant />
        </IconButton>

        <div className="flex-1" />

        <LocaleSelector />
        <About />
        <UserChip />
      </div>
    </div>
  );
};
