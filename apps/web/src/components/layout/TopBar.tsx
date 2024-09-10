import { IconButton } from "@mui/material";

import { BUNDLE } from "../../utils/bundle";
import { useTime } from "../../utils/useTime";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { Logo } from "../global/Logo";
import { LocaleSelector } from "../global/preferences/LocaleSelector";
import { UserChip } from "../global/preferences/UserChip";
import { About } from "../global/site-meta/About";

import DiscordLogo from "~icons/simple-icons/discord";

export const TopBar = () => {
  const updateTime = useTime(BUNDLE.buildTime, "short");
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
          // new discord branding color
          className="ml-2 bg-[#5865F2] hover:bg-[#5865F2] text-white"
          LinkComponent="a"
          href="https://discord.gg/8CFgUPxyrU"
          target="_blank"
          rel="noopener"
        >
          <DiscordLogo className="size-4 m-0.5" />
        </IconButton>

        <div className="flex-1" />

        <LocaleSelector />
        <About />
        <UserChip />
      </div>
    </div>
  );
};
