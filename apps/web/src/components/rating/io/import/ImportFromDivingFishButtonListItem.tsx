import { FC } from "react";
import { ListActions } from "react-use/lib/useList";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";
import { MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import IconMdiFile from "~icons/mdi/file";
import { DivingFishProfile, useAuth } from "../../../../models/context/AuthContext";
import toast from "react-hot-toast";

const CANONICAL_ID_PARTS_SEPARATOR = "__dxrt__";

const levelLabel = ["basic", "advanced", "expert", "master", "remaster"];

const getB15Data = async (divingFishProfile: DivingFishProfile | null, modifyEntries: ListActions<PlayEntry>) => {
    try {
        const bodyDic: { [key: string]: any } = {
            b50: 1
        }
        if (divingFishProfile?.diving_fish_name) {
            bodyDic["username"] = divingFishProfile?.diving_fish_name;
        } else if (divingFishProfile?.diving_fish_qq) {
            bodyDic["qq"] = divingFishProfile?.diving_fish_qq;
        }
        const response = await fetch('https://www.diving-fish.com/api/maimaidxprober/query/player', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyDic)
        });

        if (!response.ok) {
            throw new Error('Network response error');
        }

        const data = await response.json();
        const entries: PlayEntry[] = [];

        entries.push(...data.charts.dx.map((item: any) => {
            return {
                sheetId: `${item.title}${CANONICAL_ID_PARTS_SEPARATOR}${item.type.toLowerCase() == "sd" ? "std" : item.type.toLowerCase()}${CANONICAL_ID_PARTS_SEPARATOR}${levelLabel[item.level_index]}`,
                achievementRate: item.achievements,
                forceB15: true
            };
        }));
        entries.push(...data.charts.sd.map((item: any) => {
            return {
                sheetId: `${item.title}${CANONICAL_ID_PARTS_SEPARATOR}${item.type.toLowerCase() == "sd" ? "std" : item.type.toLowerCase()}${CANONICAL_ID_PARTS_SEPARATOR}${levelLabel[item.level_index]}`,
                achievementRate: item.achievements,
                forceB35: true
            };
        }));
        modifyEntries.set(entries);
        toast.success("Import From Diving-Fish Success 🎉")
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        toast.success("Somethings Error 💔")
    }
}

export const ImportFromDivingFishButtonListItem: FC<{
    modifyEntries: ListActions<PlayEntry>;
    onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
    const { divingFishProfile } = useAuth();
    return (
        <>
            <MenuItem
                onClick={async () => {
                    onClose();
                    getB15Data(divingFishProfile, modifyEntries);
                }}
            >
                <ListItemIcon>
                    <IconMdiFile />
                </ListItemIcon>
                <ListItemText>
                    Import from Diving Fish...
                </ListItemText>
            </MenuItem>
        </>
    );
};