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
import {
  FlattenedSheet,
  canonicalIdFromParts,
  useSheets,
} from "../../../songs";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";
import { SheetListItemContent } from "../../SheetListItem";

import { DifficultyEnum } from "@gekichumai/dxdata";
import clsx from "clsx";
import IconMdiCloudDownload from "~icons/mdi/cloud-download";
import { FadedImage } from "../../FadedImage";

export interface RemoteData {
  rating_records: RatingRecord[];
  profile_details: ProfileDetail[];
  version: number;
}

export interface ProfileDetail {
  id: number;
  user: number;
  version: number;
  userName: string;
  isNetMember: number;
  iconId: number;
  plateId: number;
  titleId: number;
  partnerId: number;
  frameId: number;
  selectMapId: number;
  totalAwake: number;
  gradeRating: number;
  musicRating: number;
  playerRating: number;
  highestRating: number;
  gradeRank: number;
  classRank: number;
  courseRank: number;
  charaSlot: number[];
  charaLockSlot: number[];
  contentBit: number;
  playCount: number;
  currentPlayCount: number;
  renameCredit: number;
  mapStock: number;
  eventWatchedDate: string;
  lastGameId: string;
  lastRomVersion: string;
  lastDataVersion: string;
  lastLoginDate: string;
  lastPairLoginDate: string;
  lastPlayDate: string;
  lastTrialPlayDate: string;
  lastPlayCredit: number;
  lastPlayMode: number;
  lastPlaceId: number;
  lastPlaceName: string;
  lastAllNetId: number;
  lastRegionId: number;
  lastRegionName: string;
  lastClientId: string;
  lastCountryCode: string;
  lastSelectEMoney: number;
  lastSelectTicket: number;
  lastSelectCourse: number;
  lastCountCourse: number;
  firstGameId: string;
  firstRomVersion: string;
  firstDataVersion: string;
  firstPlayDate: string;
  compatibleCmVersion: string;
  dailyBonusDate: string;
  dailyCourseBonusDate: string;
  playVsCount: number;
  playSyncCount: number;
  winCount: number;
  helpCount: number;
  comboCount: number;
  totalDeluxscore: number;
  totalBasicDeluxscore: number;
  totalAdvancedDeluxscore: number;
  totalExpertDeluxscore: number;
  totalMasterDeluxscore: number;
  totalReMasterDeluxscore: number;
  totalSync: number;
  totalBasicSync: number;
  totalAdvancedSync: number;
  totalExpertSync: number;
  totalMasterSync: number;
  totalReMasterSync: number;
  totalAchievement: number;
  totalBasicAchievement: number;
  totalAdvancedAchievement: number;
  totalExpertAchievement: number;
  totalMasterAchievement: number;
  totalReMasterAchievement: number;
  playerOldRating: number;
  playerNewRating: number;
  dateTime: number;
  banState: number;
}

export interface RatingRecord {
  id: number;
  user: number;
  version: number;
  rating: number;
  ratingList: RatingEntry[];
  newRatingList: RatingEntry[];
  nextRatingList: RatingEntry[];
  nextNewRatingList: RatingEntry[];
  udemae: Udemae;
}

export interface RatingEntry {
  level: number;
  musicId: number;
  romVersion: number;
  achievement: number;
}

export interface Udemae {
  rate: number;
  winNum: number;
  loseNum: number;
  maxRate: number;
  maxWinNum: number;
  npcWinNum: number;
  classValue: number;
  maxLoseNum: number;
  npcLoseNum: number;
  totalWinNum: number;
  npcMaxWinNum: number;
  totalLoseNum: number;
  maxClassValue: number;
  npcMaxLoseNum: number;
  npcTotalWinNum: number;
  npcTotalLoseNum: number;
}

export const ImportFromRemoteListItem: FC<{
  modifyEntries: ListActions<PlayEntry>;
  onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
  const [remoteData, setRemoteData] = useState<RemoteData | null>(null);
  const [lastModified, setLastModified] = useState<Date | null>(null);
  const handleClose = useCallback(() => {
    setRemoteData(null);
    onClose();
  }, [onClose]);

  return (
    <>
      {remoteData && (
        <Dialog open={true} onClose={handleClose}>
          <ImportFromRemoteContent
            remoteData={remoteData}
            lastModified={lastModified}
            modifyEntries={modifyEntries}
            onClose={handleClose}
          />
        </Dialog>
      )}

      <MenuItem
        color="primary"
        onClick={() => {
          toast.promise(
            fetch(
              "https://dxrating-usercontent.imgg.dev/ratings-v0/RhythmROC/maimai-140.json",
            )
              .then(async (res) => {
                if (!res.ok) throw new Error("Failed to load remote file.");
                return {
                  data: await res.json(),
                  lastModified: res.headers.get("last-modified"),
                };
              })
              .then((data) => {
                setRemoteData(data.data);
                if (data.lastModified)
                  setLastModified(new Date(data.lastModified));
              }),
            {
              loading: "Loading remote content...",
              success: "Remote content has been loaded.",
              error: "Failed to load remote content.",
            },
          );
        }}
      >
        <ListItemIcon>
          <IconMdiCloudDownload />
        </ListItemIcon>
        <ListItemText
          primary="Import from Cloud..."
          secondary="Currently only RhythmROC is supported."
        />
      </MenuItem>
    </>
  );
};

const ImportFromRemoteContent: FC<{
  remoteData: RemoteData;
  lastModified: Date | null;
  modifyEntries: ListActions<PlayEntry>;
  onClose?: () => void;
}> = ({ remoteData, lastModified, modifyEntries, onClose }) => {
  const users = useMemo(() => {
    if (!remoteData) return [];
    return remoteData.profile_details;
  }, [remoteData]);

  const [selectedUser, setSelectedUser] = useState<ProfileDetail | null>(null);
  const { data: sheets } = useSheets();
  const [warnings, setWarnings] = useState<RatingEntry[]>([]);
  const records = useMemo(() => {
    if (!selectedUser) return [];
    if (!sheets) return [];

    // First, filter and map the entries as before
    const { records, warnings } = getUserGamePlays(
      remoteData,
      selectedUser,
      sheets,
    );
    setWarnings(warnings);

    return records;
  }, [remoteData, selectedUser, sheets]);

  const mode = !selectedUser ? "select-user" : "confirm-import";

  return (
    <>
      <DialogTitle className="flex flex-col items-start">
        <div>Import from Cloud</div>
        <div className="text-sm text-gray-500">
          {mode === "select-user"
            ? "Choose the user to import their gameplays from."
            : "Confirm importing the selected user's gameplays."}
        </div>
        <div className="text-sm text-gray-500">
          Last updated:{" "}
          {lastModified ? lastModified.toLocaleString() : "Unknown"}
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
                      String(user.iconId).padStart(6, "0") +
                      `.png`
                    }
                    alt={`Icon ${String(user.iconId).padStart(6, "0")}`}
                    className="w-16 h-16 rounded-md bg-gray-400"
                  />
                </ListItemAvatar>
                <ListItemText className="flex flex-col">
                  <div>{user.userName}</div>
                  <div className={clsx("tabular-nums leading-none")}>
                    Rating{" "}
                    <span
                      className={clsx(
                        !user.lastDataVersion.startsWith("1.40")
                          ? "bg-amber rounded-t-lg px-2 py-1 inline-flex"
                          : "leading-normal",
                      )}
                    >
                      {user.playerRating}
                    </span>
                  </div>
                  {!user.lastDataVersion.startsWith("1.40") ? (
                    <div className="tracking-tighter px-1 py-0.5 bg-amber !text-xs text-amber-800 font-bold rounded-lg leading-none">
                      Obsolete Version Rating ({user.lastDataVersion})
                    </div>
                  ) : (
                    <div className="tracking-tighter px-1 py-0.5 bg-green !text-xs text-green-800 font-bold rounded-lg leading-none">
                      Latest Version Rating ({user.lastDataVersion})
                    </div>
                  )}
                  <div className="text-xs">Play Count: {user.playCount}</div>
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
                  {warnings.map((warning, i) => (
                    <li key={i}>
                      Failed to find sheet for a gameplay with:{" "}
                      <code className="bg-gray-2 px-1 py-0.5 rounded-sm b-1 b-solid b-gray-3">
                        music_id={warning.musicId} [{warning.level}]
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
              {records.map((record, i) => (
                <ListItem
                  className="flex flex-col gap-2 w-full bg-gray-2 p-1 rounded-md"
                  key={i}
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

              toast.success(`Imported ${records.length} gameplays from cloud.`);

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

const REMOTE_GAME_PLAY_LEVEL_TO_DIFFICULTY: { [key: number]: DifficultyEnum } =
  {
    0: DifficultyEnum.Basic,
    1: DifficultyEnum.Advanced,
    2: DifficultyEnum.Expert,
    3: DifficultyEnum.Master,
    4: DifficultyEnum.ReMaster,
  };

function getUserGamePlays(
  remoteData: RemoteData,
  selectedUser: ProfileDetail,
  sheets: FlattenedSheet[],
) {
  const filteredMappedGameplays = [
    ...(remoteData.rating_records.find(
      (record) => record.user === selectedUser.id,
    )?.ratingList ?? []),
    ...(remoteData.rating_records.find(
      (record) => record.user === selectedUser.id,
    )?.newRatingList ?? []),
  ].map((entry) => ({
    gameplay: entry,
    sheet: sheets.find(
      (sheet) =>
        (sheet.internalId?.std === entry.musicId ||
          sheet.internalId?.dx === entry.musicId) &&
        sheet.difficulty === REMOTE_GAME_PLAY_LEVEL_TO_DIFFICULTY[entry.level],
    ),
  }));

  const warnings: RatingEntry[] = [];
  // Finally, filter out entries that don't have a sheet
  const records = filteredMappedGameplays.filter((entry) => {
    if (entry.sheet === undefined) {
      console.warn(
        `[ImportFromAquaSQLiteButton] Failed to find sheet for gameplay: `,
        entry.gameplay,
      );
      warnings.push(entry.gameplay);
      return false;
    }

    return true;
  });

  return {
    records: records as { gameplay: RatingEntry; sheet: FlattenedSheet }[],
    warnings,
  };
}
