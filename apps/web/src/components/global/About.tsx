import { IconButton } from "@mui/material";
import { FC, PropsWithChildren, ReactNode, useState } from "react";
import MdiGithub from "~icons/mdi/github";
import MdiInformation from "~icons/mdi/information";
import MdiTwitter from "~icons/mdi/twitter";
import MdiWeb from "~icons/mdi/web";
import { BUNDLE } from "../../utils/bundle";
import { ResponsiveDialog } from "./ResponsiveDialog";

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

export const About = () => {
  const [expanded, setExpanded] = useState(false);

  const buildTime = (() => {
    try {
      const date = new Date(BUNDLE.buildTime);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      return date.toLocaleString();
    } catch {
      return "unknown";
    }
  })();

  return (
    <>
      <IconButton
        onClick={() => setExpanded(true)}
        className="!absolute right-4 top-4"
      >
        <MdiInformation />
      </IconButton>

      <ResponsiveDialog
        open={expanded}
        setOpen={(opened) => setExpanded(opened)}
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">About</h1>

          {/* <h2 className="text-lg font-bold">Author</h2> */}

          <ul className="flex flex-col gap-1.5">
            <AboutLink
              href="https://twitter.com/GalvinGao"
              startAdornment={<MdiGithub />}
              label="Author"
            >
              @GalvinGao
            </AboutLink>

            <AboutLink
              href="https://twitter.com/GalvinGao/dxrating"
              startAdornment={<MdiGithub />}
              label="Source Code"
            >
              GalvinGao/dxrating
            </AboutLink>
            {/* </ul> */}

            {/* <h2 className="text-lg font-bold">Data</h2> */}

            {/* <ul> */}
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

          <div className="flex flex-col items-start mt-24">
            <img
              className="h-12 w-auto"
              src="https://dxrating-assets.imgg.dev/images/version-adornment/buddies.png"
              alt="Buddies"
            />

            <span className="font-mono text-sm text-gray-400 mt-2">
              {BUNDLE.gitCommit?.slice(0, 7) || "unknown"}
              {BUNDLE.buildNumber !== undefined && (
                <> (build {BUNDLE.buildNumber})</>
              )}
            </span>
            <span className="font-mono text-sm text-gray-500">{buildTime}</span>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
};
