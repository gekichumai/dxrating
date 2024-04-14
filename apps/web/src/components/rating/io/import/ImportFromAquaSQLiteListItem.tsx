import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { FC, useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ListActions } from "react-use/lib/useList";
import sqljs, { Database } from "sql.js";
import {
  FlattenedSheet,
  canonicalIdFromParts,
  useSheets,
} from "../../../../songs";
import {
  AquaGamePlay,
  AquaPlayLog,
  AquaUser,
  readAquaGamePlays,
  readAquaPlayLogs,
  readAquaUsers,
} from "../../../../utils/aquaDB";
import { SheetListItemContent } from "../../../sheet/SheetListItem";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";

import IconMdiDatabase from "~icons/mdi/database";
import { formatErrorMessage } from "../../../../utils/formatErrorMessage";
import { FadedImage } from "../../../global/FadedImage";

export const ImportFromAquaSQLiteListItem: FC<{
  modifyEntries: ListActions<PlayEntry>;
  onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
  const [db, setDb] = useState<Database | null>(null);
  const handleClose = useCallback(() => {
    setDb(null);
    onClose();
  }, [onClose]);

  return (
    <>
      {db && (
        <Dialog open={true} onClose={handleClose}>
          <ImportFromAquaSQLiteDatabaseContent
            db={db}
            modifyEntries={modifyEntries}
            onClose={handleClose}
          />
        </Dialog>
      )}

      <MenuItem
        color="primary"
        onClick={() => {
          toast.promise(
            new Promise((resolve, reject) => {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".sqlite";

              const onChange = async () => {
                const file = fileInput.files?.[0];
                if (!file) {
                  return reject("No file selected");
                }

                const SQL = await sqljs({
                  // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
                  // You can omit locateFile completely when running in node
                  locateFile: (file) => `https://sql.js.org/dist/${file}`,
                });

                const r = new FileReader();
                r.onload = function () {
                  if (r.result === null || typeof r.result === "string") {
                    return reject(
                      "Failed to load file: unknown error: no result received from FileReader (typeof: " +
                        typeof r.result +
                        ")",
                    );
                  }
                  try {
                    console.info("Loaded file: " + file.name, r.result);
                    const uints = new Uint8Array(r.result);
                    console.log("Size: " + uints.length);
                    const db = new SQL.Database(uints);
                    setDb(db);
                    resolve("Database loaded.");
                  } catch (e) {
                    console.error(e);
                    reject("Failed to load file: " + e);
                  }
                };
                r.onerror = function () {
                  reject("Failed to load file: " + r.error);
                };
                r.readAsArrayBuffer(file);
              };

              fileInput.addEventListener("change", () => {
                onChange();
              });
              fileInput.addEventListener("cancel", () => {
                reject("User cancelled file selection");
              });
              fileInput.click();
            }),
            {
              loading: "Loading database...",
              success: "Database has been loaded.",
              error: "Failed to load database.",
            },
          );
        }}
      >
        <ListItemIcon>
          <IconMdiDatabase />
        </ListItemIcon>
        <ListItemText
          primary="Import from Aqua SQLite..."
          secondary="Deprecated"
        />
      </MenuItem>
    </>
  );
};

type AquaFilteredMappedEntry = {
  gameplay: AquaGamePlay;
  sheet: FlattenedSheet;
  playLog: AquaPlayLog;
};

type AquaFilteredIntermediateEntry = {
  sheet?: FlattenedSheet;
  gameplay: AquaGamePlay;
  playLog?: AquaPlayLog;
};

const ImportFromAquaSQLiteDatabaseContent: FC<{
  db: Database;
  modifyEntries: ListActions<PlayEntry>;
  onClose?: () => void;
}> = ({ db, modifyEntries, onClose }) => {
  const users = useMemo(() => {
    try {
      return readAquaUsers(db);
    } catch (e) {
      toast.error(
        "Failed to read users from Aqua SQLite database: " +
          formatErrorMessage(e),
      );
      console.error("Failed to read users from Aqua SQLite database", e);
      return [];
    }
  }, [db]);
  const [selectedUser, setSelectedUser] = useState<AquaUser | null>(null);
  const { data: sheets } = useSheets();
  const [warnings, setWarnings] = useState<AquaGamePlay[]>([]);
  const records = useMemo(() => {
    if (!selectedUser) return [];
    if (!sheets) return [];

    // First, filter and map the entries as before
    const { records, warnings } = getUserGamePlays(db, selectedUser, sheets);
    setWarnings(warnings);

    return records;
  }, [db, selectedUser, sheets]);

  const mode = !selectedUser ? "select-user" : "confirm-import";

  return (
    <>
      <DialogTitle className="flex flex-col items-start">
        <div>Import from Aqua SQLite</div>
        <div className="text-sm text-zinc-500">
          {mode === "select-user"
            ? "Choose the user to import their gameplays from."
            : "Confirm importing the selected user's gameplays."}
        </div>
      </DialogTitle>

      <DialogContent>
        {mode === "select-user" ? (
          <List className="b-1 b-solid b-gray-200 rounded-lg !py-0 overflow-hidden">
            {users.flatMap((user, i) => [
              <ListItemButton
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="flex gap-2"
              >
                <ListItemAvatar>
                  <FadedImage
                    src={
                      `https://shama.dxrating.net/assetbundle/icon/ui_icon_` +
                      String(user.icon_id).padStart(6, "0") +
                      `.png`
                    }
                    alt={`Icon ${String(user.icon_id).padStart(6, "0")}`}
                    className="w-16 h-16 rounded-md bg-gray-400"
                  />
                </ListItemAvatar>
                <ListItemText className="flex flex-col">
                  <div>{user.user_name}</div>
                  <div className="tabular-nums font-mono">
                    Rating {user.highest_rating}
                  </div>
                </ListItemText>
              </ListItemButton>,

              i !== users.length - 1 && (
                <Divider component="li" key={`divider-after-${user.id}`} />
              ),
            ])}
          </List>
        ) : (
          <div className="flex flex-col">
            {warnings.length > 0 && (
              <Alert severity="warning" className="mb-4">
                <AlertTitle>Warnings</AlertTitle>

                <ul className="list-disc list-inside">
                  {warnings.map((warning) => (
                    <li key={warning.id}>
                      Failed to find sheet for a gameplay with:{" "}
                      <code className="bg-gray-2 px-1 py-0.5 rounded-sm b-1 b-solid b-gray-3">
                        music_id={warning.music_id} [{warning.type},{" "}
                        {warning.level}]
                      </code>
                      ,{" "}
                      <code className="bg-gray-2 px-1 py-0.5 rounded-sm b-1 b-solid b-gray-3">
                        achievement={warning.achievement}
                      </code>
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            <List className="b-1 b-solid b-gray-200 rounded-lg overflow-hidden !p-1 space-y-1">
              {records.map((record) => (
                <ListItem
                  className="flex flex-col gap-2 w-full bg-gray-2 p-1 rounded-md"
                  key={record.gameplay.id}
                >
                  <div className="w-full">
                    <SheetListItemContent sheet={record.sheet} />
                  </div>

                  <div className="text-sm self-end">
                    {record.gameplay.achievement / 10000}%
                  </div>
                </ListItem>
              ))}
            </List>
          </div>
        )}
      </DialogContent>

      {mode === "confirm-import" && (
        <DialogActions>
          <Button onClick={() => setSelectedUser(null)}>Back</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={() => {
              modifyEntries.set(
                records.map((record) => ({
                  sheetId: canonicalIdFromParts(
                    record.sheet.songId,
                    record.sheet.type,
                    record.sheet.difficulty,
                  ),
                  achievementRate: record.gameplay.achievement / 10000,
                })),
              );

              toast.success(
                `Imported ${records.length} gameplays from Aqua SQLite.`,
              );

              onClose?.();
            }}
          >
            Import
          </Button>
        </DialogActions>
      )}
    </>
  );
};

function getUserGamePlays(
  db: Database,
  selectedUser: AquaUser,
  sheets: FlattenedSheet[],
) {
  const gameplays = readAquaGamePlays(db);
  const playLogs = readAquaPlayLogs(db);

  const filteredMappedGameplays = gameplays
    .filter((gameplay) => gameplay.user_id === selectedUser.id)
    .map((entry) => ({
      gameplay: entry,
      sheet: sheets.find(
        (sheet) =>
          sheet.internalId === entry.music_id &&
          sheet.difficulty === entry.level &&
          sheet.type === entry.type,
      ),
    })) as AquaFilteredIntermediateEntry[];

  // Now, find the maximum achievement for each music_id
  const intermediate = filteredMappedGameplays
    .reduce((acc, entry) => {
      const existing = acc.find(
        (e) =>
          e.gameplay.music_id === entry.gameplay.music_id &&
          e.gameplay.type === entry.gameplay.type &&
          e.gameplay.level === entry.gameplay.level,
      );

      if (!existing) {
        acc.push(entry);
      } else if (existing.gameplay.achievement < entry.gameplay.achievement) {
        Object.assign(existing, entry);
      }
      return acc;
    }, [] as AquaFilteredIntermediateEntry[])
    .map((entry) => ({
      gameplay: entry.gameplay,
      sheet: entry.sheet,
      playLog: playLogs.find(
        (playLog) =>
          playLog.music_id === entry.gameplay.music_id &&
          playLog.type === entry.gameplay.type &&
          playLog.level === entry.gameplay.level &&
          playLog.achievement === entry.gameplay.achievement,
      ),
    }));

  const warnings: AquaGamePlay[] = [];
  // Finally, filter out entries that don't have a sheet
  const records = intermediate.filter((entry) => {
    if (entry.sheet === undefined) {
      console.warn(
        `[ImportFromAquaSQLiteButton] Failed to find sheet for gameplay: `,
        entry.gameplay,
      );
      warnings.push(entry.gameplay);
      return false;
    }

    return true;
  }) as AquaFilteredMappedEntry[];

  return {
    records,
    warnings,
  };
}
