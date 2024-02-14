import { IconButton } from "@mui/material";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import MdiShareVariant from "~icons/mdi/share-variant";
import { BUNDLE } from "../../utils/bundle";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { About } from "../topbar/About";
import { LocaleSelector } from "../topbar/LocaleSelector";
import { UserChip } from "../topbar/UserChip";

export const TopBar = () => {
  const { t } = useTranslation(["root"]);
  const versionTheme = useVersionTheme();
  return (
    <div style={{ background: versionTheme.accentColor }}>
      <div className="flex items-center pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)]">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative">
          <div className="text-lg font-bold text-black/70 leading-none">
            DXRating.net
          </div>
          <div className="text-xs text-black/50 leading-none">
            {BUNDLE.version ?? "unknown"}
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
