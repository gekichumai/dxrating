import { DifficultyEnum, TypeEnum } from "@gekichumai/dxdata";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { CircularProgress } from "@mui/material";
import posthog from "posthog-js";
import toast from "react-hot-toast";
import { ListActions } from "react-use/lib/useList";

import { FlattenedSheet, canonicalIdFromParts } from "../../../../songs";
import { formatErrorMessage } from "../../../../utils/formatErrorMessage";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";

import { MusicRecord, RecentRecord } from "./ImportFromNETRecordsListItem";

import IconMdiCheck from "~icons/mdi/check";
import IconMdiClose from "~icons/mdi/close";

export type FetchNetRecordProgressState =
  | "ready"
  | "auth:in-progress"
  | "auth:succeeded"
  | "fetch:recent:in-progress"
  | "fetch:recent:completed"
  | "fetch:music:in-progress:basic"
  | "fetch:music:in-progress:advanced"
  | "fetch:music:in-progress:expert"
  | "fetch:music:in-progress:master"
  | "fetch:music:in-progress:remaster"
  | "fetch:music:in-progress:utage"
  | "fetch:music:completed"
  | "concluded";

const FETCH_STATE_PROGRESS: Record<FetchNetRecordProgressState, number> = {
  ready: 0.01,
  "auth:in-progress": 0.08,
  "auth:succeeded": 0.2,
  "fetch:recent:in-progress": 0.2,
  "fetch:recent:completed": 0.3,
  "fetch:music:in-progress:basic": 0.4,
  "fetch:music:in-progress:advanced": 0.5,
  "fetch:music:in-progress:expert": 0.6,
  "fetch:music:in-progress:master": 0.7,
  "fetch:music:in-progress:remaster": 0.8,
  "fetch:music:in-progress:utage": 0.9,
  "fetch:music:completed": 1,
  concluded: 1,
};

interface AuthParams {
  region: "jp" | "intl";
  username: string;
  password: string;
}

const fetchNetRecords = async (
  authParams: AuthParams,
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
): Promise<{ music: MusicRecord[]; recent: RecentRecord[] }> => {
  const { region, username, password } = authParams;

  return new Promise((resolve, reject) => {
    fetchEventSource(
      "https://miruku.dxrating.net/functions/fetch-net-records/v1/" + region,
      {
        method: "POST",
        body: JSON.stringify({ id: username, password }),
        openWhenHidden: true,
        headers: {
          "Content-Type": "application/json",
        },
        onmessage: (message) => {
          const event = message.event as "progress" | "data" | "error" | "";
          if (!event) {
            return;
          }

          if (event === "progress") {
            const { state } = JSON.parse(message.data) as {
              state: FetchNetRecordProgressState;
            };
            onProgress?.(state, FETCH_STATE_PROGRESS[state]);
          } else if (event === "data") {
            const data = JSON.parse(message.data) as {
              music: MusicRecord[];
              recent: RecentRecord[];
            };
            resolve(data);
          } else if (event === "error") {
            reject(new Error(JSON.parse(message.data).error));
          } else {
            console.warn("Unknown event", message);
          }
        },
        onerror: (ev) => {
          reject(new Error(ev));
          throw new Error(ev);
        },
        async onopen(response) {
          if (response.ok) {
            onProgress?.("ready", FETCH_STATE_PROGRESS.ready);
            return; // everything's good
          }

          // if the server responds with an error, DO NOT retry
          throw new Error(await response.text());
        },
      },
    );
  });
};

export const importFromNETRecords = async (
  sheets: FlattenedSheet[],
  modifyEntries: ListActions<PlayEntry>,
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
) => {
  posthog?.capture("netimport_started");

  const toastId = toast.loading("Importing records from NET...", {
    icon: <CircularProgress size="1rem" thickness={5} />,
  });
  try {
    const stored = localStorage.getItem("import-net-records");
    if (!stored) {
      toast.error(
        "Error occurred while importing records from NET: No credentials stored.",
        { id: toastId },
      );
      throw new Error("No credentials stored.");
    }
    const parsed = JSON.parse(stored);
    const { region, username, password } = parsed;
    const data = await fetchNetRecords(
      { region, username, password },
      (state, progress) => {
        onProgress?.(state, progress);
        toast.loading(
          <div className="flex flex-col items-start min-w-[16rem]">
            <div className="font-bold">Importing records from NET...</div>
            <div className="font-mono text-xs font-light text-zinc-500">
              {state}
            </div>
          </div>,
          {
            id: toastId,
            icon: (
              <CircularProgress
                variant="determinate"
                value={progress * 100}
                size="1rem"
                thickness={5}
              />
            ),
          },
        );
      },
    );
    const entries = data.music
      .filter((entry) => {
        return entry.sheet.difficulty !== "utage";
      })
      .map((record) => {
        return {
          sheetId: canonicalIdFromParts(
            record.sheet.songId,
            (
              {
                standard: TypeEnum.STD,
                dx: TypeEnum.DX,
                utage: TypeEnum.UTAGE,
              } as const
            )[record.sheet.type],
            record.sheet.difficulty as DifficultyEnum,
          ),
          achievementRate: record.achievement.rate / 10000,
        };
      })
      .filter((entry) => {
        const exists = sheets?.find((sheet) => sheet.id === entry.sheetId);
        if (!exists) {
          console.warn(
            "[ImportFromNETRecordsDialogContent] sheet not found",
            entry,
          );
        }
        return exists;
      });
    modifyEntries.set(entries);

    const lastRecord = data.recent.at(0);
    toast.success(
      <div className="flex flex-col">
        <span>
          Imported {entries.length} records from {String(region).toUpperCase()}{" "}
          NET.
        </span>
        {lastRecord && (
          <>
            <span className="text-sm text-zinc-500">Latest Play</span>
            <span className="text-xs text-zinc-500">
              {lastRecord.sheet.songId} [{lastRecord.sheet.type}]
            </span>
            {lastRecord.play.timestamp && (
              <span className="text-xs text-zinc-500">
                Date: {new Date(lastRecord.play.timestamp).toLocaleString()}
              </span>
            )}
            {/* <span className="text-xs text-zinc-500">
                      Rating:
                    </span> */}
          </>
        )}
      </div>,
      {
        id: toastId,
        icon: <IconMdiCheck className="h-4 w-4 text-green-5" />,
        duration: 20000,
      },
    );

    posthog?.capture("netimport_succeeded", {
      region,
      count: entries.length,
    });
  } catch (error) {
    toast.error(
      "Error occurred while importing records from NET: " +
        formatErrorMessage(error),
      {
        id: toastId,
        icon: <IconMdiClose className="h-4 w-4 text-red-5" />,
        duration: 20000,
      },
    );
  }
};
