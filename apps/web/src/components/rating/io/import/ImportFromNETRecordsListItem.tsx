import { DifficultyEnum, TypeEnum } from "@gekichumai/dxdata";
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
} from "@mui/material";
import { FC, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ListActions } from "react-use/lib/useList";
import IconMdiConnection from "~icons/mdi/connection";
import IconMdiNewBox from "~icons/mdi/new-box";
import { canonicalIdFromParts, useSheets } from "../../../../songs";
import { formatErrorMessage } from "../../../../utils/formatErrorMessage";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";

interface AchievementRecord {
  sheet: {
    songId: string;
    type: "standard" | "dx" | "utage";
    difficulty:
      | "basic"
      | "advanced"
      | "expert"
      | "master"
      | "remaster"
      | "utage";
  };
  achievement: {
    rate: number;
    dxScore: {
      achieved: number;
      total: number;
    };
    flags:
      | "fullCombo"
      | "fullCombo+"
      | "allPerfect"
      | "allPerfect+"
      | "syncPlay"
      | "fullSync"
      | "fullSync+"
      | "fullSyncDX"
      | "fullSyncDX+"[];
  };
}

export type MusicRecord = AchievementRecord;
export type RecentRecord = AchievementRecord & {
  play: {
    track: number;
    timestamp?: string;
  };
};

export const ImportFromNETRecordsListItem: FC<{
  modifyEntries: ListActions<PlayEntry>;
  onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
  const [open, setOpen] = useState(false);
  const handleClose = () => {
    setOpen(false);
    onClose();
  };

  return (
    <>
      {open && (
        <Dialog open={open} onClose={handleClose}>
          <ImportFromNETRecordsDialogContent
            modifyEntries={modifyEntries}
            onClose={handleClose}
          />
        </Dialog>
      )}
      <MenuItem
        className="max-w-xl"
        onClick={() => {
          setOpen(true);
        }}
      >
        <ListItemIcon>
          <IconMdiConnection />
        </ListItemIcon>
        <ListItemText
          primary={<>Import from maimai NET...</>}
          secondary={
            <div className="whitespace-pre-line flex flex-col items-start gap-1">
              <div>
                <IconMdiNewBox className="flex-inline" /> Requires Sega ID.
              </div>
              <div>
                Imports your records directly from the official NET service.
                Supports both JP and INTL servers.
              </div>
            </div>
          }
        />
      </MenuItem>
    </>
  );
};

const ImportFromNETRecordsDialogContent: FC<{
  modifyEntries: ListActions<PlayEntry>;
  onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
  const [remember, setRemember] = useState(false);
  const [region, setRegion] = useState<"intl" | "jp">("intl");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: sheets } = useSheets();

  useEffect(() => {
    const stored = localStorage.getItem("import-net-records");
    if (!stored) return;
    const { region, username, password } = JSON.parse(stored);
    setRegion(region);
    setUsername(username);
    setPassword(password);
    setRemember(true);
  }, []);

  useEffect(() => {
    if (!remember) {
      localStorage.removeItem("import-net-records");
    } else {
      localStorage.setItem(
        "import-net-records",
        JSON.stringify({ region, username, password }),
      );
    }
  }, [remember, region, username, password]);

  const handleImport = async () => {
    setBusy(true);
    try {
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
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Failed to import records: " + formatErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogTitle>Import from NET</DialogTitle>
      <DialogContent>
        <DialogContentText className="flex flex-col items-start gap-2 py-2">
          <FormControl>
            <TextField
              label="Region"
              select
              value={region}
              onChange={(event) =>
                setRegion(event.target.value as "intl" | "jp")
              }
            >
              <MenuItem value="intl">
                <span>
                  <span>International </span>
                  <span className="text-gray-4 text-sm">
                    (maimaidx-eng.com)
                  </span>
                </span>
              </MenuItem>
              <MenuItem value="jp">
                <span>
                  <span>Japan </span>
                  <span className="text-gray-4 text-sm">(maimaidx.jp)</span>
                </span>
              </MenuItem>
            </TextField>
          </FormControl>

          <FormControl>
            <TextField
              label="Your Sega ID"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </FormControl>

          <FormControl>
            <TextField
              label="Your Sega ID Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
            }
            label="Remember Credentials"
          />

          <div className="text-sm text-gray-500">
            Your credentials will be used to communicate with the official
            maimai NET service to import your records. They will not be stored
            on our servers.
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleImport}
          disabled={!username || !password || busy}
          variant="contained"
        >
          {busy ? (
            <div className="flex gap-2 items-center">
              <CircularProgress size="1rem" className="text-gray-5" />

              <span className="text-gray-5">Importing...</span>
            </div>
          ) : (
            "Import"
          )}
        </Button>
      </DialogActions>
    </>
  );
};
