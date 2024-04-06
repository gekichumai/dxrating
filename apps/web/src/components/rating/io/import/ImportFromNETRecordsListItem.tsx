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
import { useLocalStorage } from "react-use";
import { ListActions } from "react-use/lib/useList";
import IconMdiConnection from "~icons/mdi/connection";
import IconMdiNewBox from "~icons/mdi/new-box";
import { useSheets } from "../../../../songs";
import { formatErrorMessage } from "../../../../utils/formatErrorMessage";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";
import { importFromNETRecords } from "./importFromNETRecords";

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
  const [autoImport, setAutoImport] = useLocalStorage(
    "rating-auto-import-from-net",
    false,
  );
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
      await importFromNETRecords(sheets!, modifyEntries);
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
              autoComplete="off"
              autoCapitalize="none"
              inputProps={{
                "data-sentry-ignore": true,
                "data-1p-ignore": true,
              }}
            />
          </FormControl>

          <FormControl>
            <TextField
              label="Your Sega ID Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              inputProps={{
                "data-sentry-ignore": true,
                "data-1p-ignore": true,
              }}
            />
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={remember}
                onChange={(event) => {
                  setRemember(event.target.checked);
                  if (!event.target.checked) setAutoImport(false);
                }}
              />
            }
            label={
              <div className="flex flex-col">
                <span>Remember Credentials</span>
                <span className="text-xs text-gray-500">
                  Your credentials will be stored locally in your browser.
                </span>
              </div>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={autoImport}
                onChange={(event) => setAutoImport(event.target.checked)}
                disabled={!remember}
              />
            }
            label={
              <div className="flex flex-col">
                <span>Auto-import</span>
                <span className="text-xs text-gray-500">
                  Automatically start importing records from NET on page load.
                  Requires "Remember Credentials" to be enabled.
                </span>
              </div>
            }
          />

          <div className="h-px w-full bg-gray-200 my-2" />

          <div className="text-sm text-gray-500 [&>p]:mb-1">
            <p className="font-bold">
              Your credentials will not be stored, logged, or shared, and are
              only used for the duration of this import process. If you wish,
              you may{" "}
              <a
                href="https://github.com/gekichumai/dxrating/tree/main/packages/self-hosted-functions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                inspect the source code
              </a>
              .
            </p>

            <p>
              We are also in the progress of employing the{" "}
              <a
                href="https://slsa.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                SLSA framework
              </a>
              , including reproducible builds and signed container images to
              help users determine the authenticity of the code running on our
              server. Moreover, if demand arises, we will support connecting to
              self-hosted instances of the NET import service so you can run it
              on your own infra.
            </p>
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
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
          ) : autoImport ? (
            "Re-import Now"
          ) : (
            "Import Once"
          )}
        </Button>
      </DialogActions>
    </>
  );
};
