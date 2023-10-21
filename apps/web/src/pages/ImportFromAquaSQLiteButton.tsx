import {
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
import { PlayEntry } from "../components/RatingCalculatorAddEntryForm";
import { SheetListItemContent } from "../components/SheetListItem";
import { FlattenedSheet, canonicalIdFromParts, useSheets } from "../songs";
import {
  AquaGamePlay,
  AquaUser,
  readAquaGamePlays,
  readAquaUsers,
} from "../utils/aquaDB";

import IconMdiDatabase from "~icons/mdi/database";

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
              fileInput.addEventListener("change", async () => {
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

                  const Uints = new Uint8Array(r.result);
                  const db = new SQL.Database(Uints);
                  setDb(db);
                  resolve("Database loaded.");
                };
                r.readAsArrayBuffer(file);
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
        <ListItemText>Import from Aqua SQLite...</ListItemText>
      </MenuItem>
    </>
  );
};

const ImportFromAquaSQLiteDatabaseContent: FC<{
  db: Database;
  modifyEntries: ListActions<PlayEntry>;
  onClose?: () => void;
}> = ({ db, modifyEntries, onClose }) => {
  const users = useMemo(() => readAquaUsers(db), [db]);
  const [selectedUser, setSelectedUser] = useState<AquaUser | null>(null);
  const { data: sheets } = useSheets();
  const records = useMemo(() => {
    if (!selectedUser) return [];
    if (!sheets) return [];

    const gameplays = readAquaGamePlays(db);
    return gameplays
      .filter((gameplay) => gameplay.user_id === selectedUser.id)
      .map((entry) => ({
        gameplay: entry,
        sheet: sheets.find(
          (sheet) =>
            sheet.internalId === entry.music_id &&
            sheet.difficulty === entry.level &&
            sheet.type === entry.type,
        ),
      }))
      .filter((entry) => entry.sheet !== undefined) as {
      gameplay: AquaGamePlay;
      sheet: FlattenedSheet;
    }[];
  }, [db, selectedUser, sheets]);

  const mode = !selectedUser ? "select-user" : "confirm-import";

  return (
    <>
      <DialogTitle className="flex flex-col items-start">
        <div>Import from Aqua SQLite</div>
        <div className="text-sm text-gray-500">
          {mode === "select-user"
            ? "Choose the user to import their gameplays from."
            : "Confirm importing the selected user's gameplays."}
        </div>
      </DialogTitle>

      <DialogContent>
        {mode === "select-user" ? (
          <List className="b-1 b-solid b-gray-200 rounded-lg !py-0 overflow-hidden">
            {users.map((user, i) => (
              <>
                <ListItemButton
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="flex gap-2"
                >
                  <ListItemAvatar>
                    <img
                      src={
                        `https://dxrating-assets.imgg.dev/assetbundle/icon/ui_icon_` +
                        String(user.icon_id).padStart(6, "0") +
                        `.png`
                      }
                      alt={`Icon ${String(user.icon_id).padStart(6, "0")}`}
                      className="w-16 h-16 rounded-md bg-gray-400"
                    />
                  </ListItemAvatar>
                  <ListItemText className="flex flex-col">
                    <div>{user.user_name}</div>
                    <div className="tabular-nums">
                      Rating {user.highest_rating}
                    </div>
                  </ListItemText>
                </ListItemButton>

                {i !== users.length - 1 && <Divider component="li" />}
              </>
            ))}
          </List>
        ) : (
          <List className="b-1 b-solid b-gray-200 rounded-lg !py-0 overflow-hidden">
            {records.map((record) => (
              <ListItem>
                <SheetListItemContent sheet={record.sheet} />
              </ListItem>
            ))}
          </List>
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
