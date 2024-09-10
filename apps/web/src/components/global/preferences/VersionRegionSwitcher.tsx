import { VersionEnum } from "@gekichumai/dxdata";
import { CheckIcon, Select } from "@mantine/core";
import uniqBy from "lodash-es/uniqBy";
import { FC } from "react";
import { useTranslation } from "react-i18next";

import {
  DXVersion,
  DXVersionToDXDataVersionEnumMap,
  Region,
} from "../../../models/context/AppContext";
import { useAppContext } from "../../../models/context/useAppContext";
import { startViewTransition } from "../../../utils/startViewTransition";
import { useVersionTheme } from "../../../utils/useVersionTheme";
import { WebpSupportedImage } from "../WebpSupportedImage";

const fromMergedVersionRegionId = (id: string) => {
  const [version, region] = id.split("__") as [DXVersion, Region];
  return { version, region };
};

const toMergedVersionRegionId = (version: DXVersion, region: Region) =>
  `${version}__${region}`;

interface VersionRegion {
  id: string;
  versionEnum: VersionEnum;
  dxVersion: DXVersion;
  region: Region;
}

const VERSION_REGIONS: VersionRegion[] = [
  {
    dxVersion: "buddies-plus" as const,
    region: "jp" as const,
  },
  {
    dxVersion: "buddies" as const,
    region: "intl" as const,
  },
  {
    dxVersion: "buddies" as const,
    region: "cn" as const,
  },
].map(({ dxVersion, region }) => ({
  id: `${dxVersion}__${region}`,
  versionEnum: DXVersionToDXDataVersionEnumMap[dxVersion],
  dxVersion,
  region,
}));

const Option = ({
  value,
  label,
  checked,
}: {
  value: string;
  label: string;
  checked?: boolean;
}) => {
  const theme = useVersionTheme();
  const { t } = useTranslation(["settings"]);

  return (
    <div className="flex items-center gap-1.5 w-full">
      <WebpSupportedImage
        src={`https://shama.dxrating.net/images/version-logo/${fromMergedVersionRegionId(value).version}.png`}
        className="w-16 touch-callout-none"
        draggable={false}
      />

      <div className="flex flex-col items-start justify-center gap-0.5">
        <div className="text-sm leading-none">
          {t(`settings:region.${fromMergedVersionRegionId(value).region}`)}
        </div>

        <div
          className="font-bold text-gray-5 leading-none"
          style={{ color: theme.accentColor.hex }}
        >
          {label}
        </div>
      </div>
      <div className="flex-1" />
      {checked && <CheckIcon className="size-3 opacity-70" />}
    </div>
  );
};

export const VersionRegionSwitcher: FC = () => {
  const { version, region, setVersionAndRegion } = useAppContext();
  const { t } = useTranslation(["settings"]);

  return (
    <Select
      value={toMergedVersionRegionId(version, region)}
      variant="filled"
      maxDropdownHeight={400}
      onChange={(v) => {
        if (v === null) return;
        const { version, region } = fromMergedVersionRegionId(v);
        startViewTransition(() => {
          setVersionAndRegion(version, region);
        });
      }}
      allowDeselect={false}
      renderOption={({ option, checked }) => (
        <Option value={option.value} label={option.label} checked={checked} />
      )}
      data={[
        {
          group: t("settings:version-and-region.select"),
          items: VERSION_REGIONS.map((v) => ({
            value: toMergedVersionRegionId(v.dxVersion, v.region),
            label: v.versionEnum,
          })),
        },
        {
          group: t("settings:version-and-region.select-generic"),
          items: uniqBy(
            VERSION_REGIONS,
            (versionRegion) => versionRegion.dxVersion,
          ).map((v) => ({
            value: toMergedVersionRegionId(v.dxVersion, "_generic"),
            label: v.versionEnum,
          })),
        },
      ]}
    />
  );
};
