import { VERSION_ID_MAP } from "@gekichumai/dxdata";
import { Button, IconButton, TextField } from "@mui/material";
import { FC, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import IconMdiClose from "~icons/mdi/close";
import MdiIconInfo from "~icons/mdi/information";
import IconMdiOcr from "~icons/mdi/ocr";
import { SheetListContainer } from "../components/sheet/SheetListContainer";
import {
  SheetSortFilter,
  SheetSortFilterForm,
} from "../components/sheet/SheetSortFilter";
import {
  SheetDetailsContext,
  SheetDetailsContextProvider,
} from "../models/context/SheetDetailsContext";
import { useAppContextDXDataVersion } from "../models/context/useAppContext";
import { FlattenedSheet, useFilteredSheets, useSheets } from "../songs";
import { DXRatingPlugin } from "../utils/capacitor/plugin/wrap";
import { isBuildPlatformApp } from "../utils/env";

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg));

const skeletonWidths = Array.from({ length: 20 }).map(
  () => Math.random() * 6.0 + 5.5,
);

const SORT_DESCRIPTOR_MAPPING = {
  releaseDate: "releaseDateTimestamp" as const,
};

const SheetListInner: FC = () => {
  const { t } = useTranslation(["sheet"]);
  const { data: sheets, isLoading } = useSheets();
  const { setQueryActive } = useContext(SheetDetailsContext);
  const version = useAppContextDXDataVersion();
  const [query, setQuery] = useState("");
  const { results, elapsed: searchElapsed } = useFilteredSheets(query);
  const [sortFilterOptions, setSortFilterOptions] =
    useState<SheetSortFilterForm | null>(null);

  const { filteredResults, elapsed: filteringElapsed } = useMemo(() => {
    const startTime = performance.now();
    let sortFilteredResults: FlattenedSheet[] = results;
    if (sortFilterOptions) {
      sortFilteredResults = results.filter((sheet) => {
        return chainEvery<FlattenedSheet>(
          (v) => {
            if (sortFilterOptions.filters.internalLevelValue) {
              const { min, max } = sortFilterOptions.filters.internalLevelValue;
              return v.internalLevelValue >= min && v.internalLevelValue <= max;
            } else {
              return true;
            }
          },
          (v) => {
            if (sortFilterOptions.filters.versions) {
              const currentVersionId = VERSION_ID_MAP.get(version) ?? 0;
              const validVersions = Array.from(VERSION_ID_MAP.entries())
                .filter(([, id]) => id <= currentVersionId)
                .map(([v]) => v);
              const versions = sortFilterOptions.filters.versions.filter((v) =>
                validVersions.includes(v),
              );
              return versions.includes(v.version);
            } else {
              return true;
            }
          },
          (v) => {
            if (sortFilterOptions.filters.tags.length) {
              const tags = sortFilterOptions.filters.tags;
              return tags.every((tag) => v.tags.includes(tag));
            } else {
              return true;
            }
          },
        )(sheet);
      });
      if (!query) {
        sortFilteredResults.sort((a, b) =>
          sortFilterOptions.sorts.reduce((acc, sort) => {
            if (acc !== 0) {
              return acc;
            }
            const descriptor =
              SORT_DESCRIPTOR_MAPPING[
                sort.descriptor as keyof typeof SORT_DESCRIPTOR_MAPPING
              ] ?? sort.descriptor;
            const aValue = a[descriptor];
            const bValue = b[descriptor];

            if (
              a.songId === "言ノ葉カルマ" ||
              a.songId === "エスオーエス" ||
              b.songId === "言ノ葉カルマ" ||
              b.songId === "エスオーエス"
            ) {
              console.log(a, b, aValue, bValue);
            }

            // null or undefined goes to the end
            if (aValue == null && bValue == null) {
              return 0;
            } else if (aValue == null) {
              return -1;
            } else if (bValue == null) {
              return -1;
            }

            if (aValue < bValue) {
              return sort.direction === "asc" ? -1 : 1;
            }
            if (aValue > bValue) {
              return sort.direction === "asc" ? 1 : -1;
            }
            return 0;
          }, 0),
        );
      }
    }
    return {
      filteredResults: sortFilteredResults,
      elapsed: performance.now() - startTime,
    };
  }, [results, sortFilterOptions, query, version]);

  return (
    <div className="flex-container pb-global">
      <TextField
        label={t("sheet:search")}
        variant="outlined"
        value={query}
        fullWidth
        onChange={(e) => {
          setQuery(e.target.value);
          setQueryActive(!!e.target.value);
        }}
        InputProps={{
          endAdornment: query && (
            <IconButton
              onClick={() => {
                setQuery("");
                setQueryActive(false);
              }}
              size="small"
            >
              <IconMdiClose />
            </IconButton>
          ),
        }}
      />

      {isBuildPlatformApp && (
        <Button
          onClick={() => DXRatingPlugin.launchInstantOCR()}
          className="mt-2 rounded-full"
          variant="contained"
          startIcon={<IconMdiOcr />}
        >
          {t("sheet:ocr")}
        </Button>
      )}

      <SheetSortFilter onChange={(v) => setSortFilterOptions(v)} />

      <div className="text-sm rounded-full shadow-lg px-4 py-2 bg-blue-200 relative overflow-hidden select-none font-bold">
        <div
          className="absolute -inset-4 bg-blue-900/20 -skew-x-8 translate-x-4 transition-width"
          style={{
            width:
              (filteredResults.length /
                (sheets?.length ?? filteredResults.length)) *
                100 +
              "%",
          }}
        />
        <div className="relative z-1 flex items-center gap-2">
          <MdiIconInfo className="text-blue-900" />
          <div className="text-blue-900">
            {t("sheet:search-summary", {
              found: isLoading ? "..." : filteredResults.length,
              total: isLoading ? "..." : sheets?.length,
              elapsed: (searchElapsed + filteringElapsed).toFixed(1),
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col w-full">
          {skeletonWidths.map((width, i) => (
            <div
              className="animate-pulse flex items-center justify-start gap-4 w-full h-[78px] px-5 py-2"
              key={i}
              style={{
                animationDelay: `${i * 40}ms`,
              }}
            >
              <div className="h-12 w-12 min-w-[3rem] min-h-[3rem] rounded bg-slate-6/50"></div>
              <div className="flex flex-col gap-1">
                <div
                  className="bg-slate-5/50 h-5 mb-1"
                  style={{ width: `${width}rem` }}
                >
                  &nbsp;
                </div>
                <div className="w-24 bg-slate-3/50 h-3">&nbsp;</div>
              </div>

              <div className="flex-1" />
              <div className="w-10 bg-slate-5/50 h-6 mr-2">&nbsp;</div>
            </div>
          ))}
        </div>
      ) : (
        <SheetListContainer sheets={filteredResults} />
      )}
    </div>
  );
};

export const SheetList: FC = () => {
  return (
    <SheetDetailsContextProvider>
      <SheetListInner />
    </SheetDetailsContextProvider>
  );
};
