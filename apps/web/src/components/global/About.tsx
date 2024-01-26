import { dxdata } from "@gekichumai/dxdata";
import { IconButton } from "@mui/material";
import { FC, PropsWithChildren, ReactNode, useMemo, useState } from "react";
import MdiGithub from "~icons/mdi/github";
import MdiInformation from "~icons/mdi/information";
import MdiTwitter from "~icons/mdi/twitter";
import MdiWeb from "~icons/mdi/web";
import { BUNDLE } from "../../utils/bundle";
import { ResponsiveDialog } from "./ResponsiveDialog";
import { intlFormatDistance } from "date-fns";

const AboutLink: FC<
  PropsWithChildren<{ href: string; startAdornment?: ReactNode; label: string }>
> = ({ href, startAdornment, label, children }) => (
  <li className="flex md:flex-row flex-col gap-1">
    <span className="font-bold mr-2">{label}</span>
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500"
    >
      {startAdornment}
      {children}
    </a>
  </li>
);

const AboutAttribute: FC<
  PropsWithChildren<{ label: ReactNode; value: ReactNode }>
> = ({ label, value }) => (
  <li className="flex flex-col items-start font-mono">
    <span className="font-bold text-xs scale-75 origin-left-bottom text-gray-400">
      {label}
    </span>
    <span className="text-sm tracking-tight text-gray-600">{value}</span>
  </li>
);

const useTime = (time?: string) => {
  return useMemo(() => {
    try {
      if (!time) throw new Error("useTime: time is undefined");

      const date = new Date(time);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }

      const dateString = date.toLocaleString();
      const relativeTime = intlFormatDistance(date, new Date());

      return `${dateString} (${relativeTime})`;
    } catch {
      return "unknown";
    }
  }, [time]);
};

export const About = () => {
  const [expanded, setExpanded] = useState(false);

  const buildTime = useTime(BUNDLE.buildTime);
  const updateTime = useTime(dxdata.updateTime);

  return (
    <>
      <IconButton
        onClick={() => setExpanded(true)}
        className="!absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] "
      >
        <MdiInformation />
      </IconButton>

      <ResponsiveDialog
        open={expanded}
        setOpen={(opened) => setExpanded(opened)}
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">About</h1>

          <ul className="flex flex-col gap-1.5">
            <AboutLink
              href="https://github.com/GalvinGao"
              startAdornment={<MdiGithub />}
              label="Author"
            >
              @GalvinGao
            </AboutLink>

            <AboutLink
              href="https://github.com/GalvinGao/dxrating"
              startAdornment={<MdiGithub />}
              label="Source Code"
            >
              GalvinGao/dxrating
            </AboutLink>

            <AboutLink
              href="https://twitter.com/maiLv_Chihooooo"
              startAdornment={<MdiTwitter />}
              label="Internal Level Value"
            >
              maimai譜面定数ちほー🏖☀️ (@maiLv_Chihooooo)
            </AboutLink>

            <AboutLink
              href="https://arcade-songs.zetaraku.dev/maimai/about/"
              startAdornment={<MdiWeb />}
              label="Chart Metadata"
            >
              arcade-songs.zetaraku.dev
            </AboutLink>
          </ul>

          <div className="flex flex-col items-start mt-24 gap-1">
            <img
              className="h-12 w-auto touch-callout-none mb-2"
              src="https://shama.dxrating.net/images/version-adornment/buddies.png"
              alt="Version"
              draggable={false}
            />

            <AboutAttribute
              label="commit"
              value={BUNDLE.gitCommit?.slice(0, 7) || "unknown"}
            />

            {BUNDLE.buildNumber !== undefined && (
              <>
                {" "}
                <AboutAttribute
                  label="build"
                  value={"#" + BUNDLE.buildNumber}
                />
              </>
            )}

            <AboutAttribute label="built at" value={buildTime} />

            <AboutAttribute label="upstream data version" value={updateTime} />
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
};
