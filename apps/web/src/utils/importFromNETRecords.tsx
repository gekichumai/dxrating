import { DifficultyEnum, TypeEnum } from "@gekichumai/dxdata";
import toast from "react-hot-toast";
import { ListActions } from "react-use/lib/useList";
import { PlayEntry } from "../components/rating/RatingCalculatorAddEntryForm";
import {
  MusicRecord,
  RecentRecord,
} from "../components/rating/io/import/ImportFromNETRecordsListItem";
import { FlattenedSheet, canonicalIdFromParts } from "../songs";
import { formatErrorMessage } from "./formatErrorMessage";

export const importFromNETRecords = async (
  sheets: FlattenedSheet[],
  modifyEntries: ListActions<PlayEntry>,
) => {
  const toastId = toast.loading("Importing records from NET...");
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
    const response = await fetch(
      "https://miruku.dxrating.net/functions/fetch-net-records/v0",
      {
        method: "POST",
        body: JSON.stringify({ region, id: username, password }),
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    const data = (await response.json()) as {
      recentRecords: RecentRecord[];
      musicRecords: MusicRecord[];
    };
    const entries = data.musicRecords
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

    const lastRecord = data.recentRecords.at(0);
    toast.success(
      <div className="flex flex-col">
        <span>
          Imported {entries.length} records from {String(region).toUpperCase()}{" "}
          NET.
        </span>
        {lastRecord && (
          <>
            <span className="text-sm text-gray-500">Latest Play</span>
            <span className="text-xs text-gray-500">
              {lastRecord.sheet.songId} [{lastRecord.sheet.type}]
            </span>
            {lastRecord.play.timestamp && (
              <span className="text-xs text-gray-500">
                Date: {new Date(lastRecord.play.timestamp).toLocaleString()}
              </span>
            )}
            {/* <span className="text-xs text-gray-500">
                      Rating:
                    </span> */}
          </>
        )}
      </div>,
      {
        id: toastId,
        duration: 30000,
      },
    );
  } catch (error) {
    toast.error(
      "Error occurred while importing records from NET: " +
        formatErrorMessage(error),
      { id: toastId },
    );
    throw error;
  }
};
