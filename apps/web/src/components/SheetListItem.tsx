import { DifficultyEnum, TypeEnum, VersionEnum } from "@gekichumai/dxdata";
import {
  Dialog,
  DialogContent,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  SwipeableDrawer,
} from "@mui/material";
import clsx from "clsx";
import { FC, HTMLAttributes, memo, useState } from "react";
import { FlattenedSheet } from "../songs";
import { useIsLargeDevice } from "../utils/breakpoints";
import { SheetDialogContent } from "./SheetDialogContent";

export const SheetListItem: FC<{
  sheet: FlattenedSheet;
  size?: "small" | "medium";
}> = memo(({ sheet, size = "medium" }) => {
  const [open, setOpen] = useState(false);
  const isLargeDevice = useIsLargeDevice();

  return (
    <>
      <SheetDialog sheet={sheet} open={open} setOpen={setOpen} />

      <ListItemButton
        disableGutters={!isLargeDevice}
        className={clsx(
          "w-full b-b-1 b-solid b-gray-200 cursor-pointer transition duration-500",
          open && "!bg-zinc-300/80",
        )}
        onClick={() => setOpen(true)}
        sx={{
          borderRadius: 1,
        }}
      >
        <SheetListItemContent sheet={sheet} size={size} />
      </ListItemButton>
    </>
  );
});
SheetListItem.displayName = "SheetListItem";

export const SheetListItemContent: FC<
  {
    sheet: FlattenedSheet;
    size?: "small" | "medium";
  } & HTMLAttributes<HTMLDivElement>
> = memo(({ sheet, size = "medium", className, ...rest }) => {
  return (
    <div
      className={clsx(
        "flex items-center w-full p-1 gap-2 tabular-nums relative",
        className,
      )}
      {...rest}
    >
      <SheetImage name={sheet.imageName} size={size} />

      <ListItemText className="ml-2">
        <SheetTitle
          title={sheet.title}
          difficulty={sheet.difficulty}
          type={sheet.type}
          version={sheet.version}
          className={clsx(
            "font-bold",
            size === "small" ? "text-sm" : "text-lg",
          )}
        />
      </ListItemText>

      <ListItemSecondaryAction>
        <SheetInternalLevelValue value={sheet.internalLevelValue} />
      </ListItemSecondaryAction>
    </div>
  );
});
SheetListItem.displayName = "SheetListItem";

const SheetInternalLevelValue: FC<{ value: number }> = ({ value }) => {
  const wholePart = Math.floor(value);
  const decimalPart = value - wholePart;

  return (
    <div className="font-bold tracking-tighter">
      <span className="text-md text-zinc-600">{wholePart}.</span>
      <span className={decimalPart === 0 ? "text-md" : "text-xl"}>
        {decimalPart.toFixed(1).split(".")[1]}
      </span>
    </div>
  );
};

export const SheetDialog: FC<{
  sheet: FlattenedSheet;
  open: boolean;
  setOpen: (open: boolean) => void;
}> = ({ sheet, open, setOpen }) => {
  const isLargeDevice = useIsLargeDevice();

  return isLargeDevice ? (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
      <DialogContent>
        <SheetDialogContent sheet={sheet} />
      </DialogContent>
    </Dialog>
  ) : (
    <SwipeableDrawer
      disableDiscovery
      disableSwipeToOpen
      anchor="bottom"
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      sx={{
        "& .MuiDrawer-paper": {
          height:
            "calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 4rem)",
        },
      }}
      PaperProps={{
        sx: {
          "&": {
            borderRadius: "0.75rem 0.75rem 0 0",
          },
        },
      }}
    >
      {/* <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-zinc-100 flex flex-col rounded-t-[10px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-[1]"> */}
      <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 my-3" />
      <div className="overflow-auto h-full p-4 pt-0">
        {open && <SheetDialogContent sheet={sheet} />}
      </div>
      {/* </Drawer.Content> */}
      {/* // </Drawer.Portal> */}
    </SwipeableDrawer>
  );
};

const DIFFICULTIES: Record<
  DifficultyEnum,
  { title: string; color: string; dark?: boolean }
> = {
  [DifficultyEnum.Basic]: {
    title: "Basic",
    color: "#6abe43",
  },
  [DifficultyEnum.Advanced]: {
    title: "Advanced",
    color: "#eeba41",
  },
  [DifficultyEnum.Expert]: {
    title: "Expert",
    color: "#eb666a",
  },
  [DifficultyEnum.Master]: {
    title: "Master",
    color: "#9555d5",
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: "Re:Master",
    color: "#d3acfa",
  },
};

const SheetDifficulty: FC<{ difficulty: DifficultyEnum }> = ({
  difficulty,
}) => {
  const difficultyConfig = DIFFICULTIES[difficulty];
  return (
    <span
      className="rounded-full px-2 text-sm shadow-[0.0625rem_0.125rem_0_0_#0b38714D] leading-relaxed translate-y-[-0.125rem] text-white"
      style={{ backgroundColor: difficultyConfig.color }}
    >
      {difficultyConfig.title}
    </span>
  );
};

const SHEET_TYPE_IMAGE = {
  [TypeEnum.DX]: "https://dxrating-assets.imgg.dev/images/type_dx.png",
  [TypeEnum.SD]: "https://dxrating-assets.imgg.dev/images/type_sd.png",
};

const SheetType: FC<{ type: TypeEnum }> = ({ type }) => {
  return (
    <img src={SHEET_TYPE_IMAGE[type]} className="w-70px h-26px" alt={type} />
  );
};

export const SheetImage: FC<{ name: string; size?: "small" | "medium" }> = ({
  name,
  size = "medium",
}) => {
  return (
    <img
      key={name}
      src={"https://dxrating-assets.imgg.dev/images/cover/" + name}
      className={clsx(
        "bg-slate-100",
        size === "small" ? "h-8 w-8 rounded-sm" : "h-12 w-12 rounded",
      )}
    />
  );
};

export const SheetTitle: FC<{
  title: string;
  difficulty: DifficultyEnum;
  type: TypeEnum;
  version: VersionEnum;
  className?: string;
}> = ({ title, difficulty, type, version, className }) => {
  return (
    <div className="flex flex-col">
      <h3
        className={clsx(
          "flex flex-col md:flex-row md:items-center gap-x-2 gap-y-1",
          className,
        )}
      >
        <span className="translate-y-[-0.125rem]">{title}</span>
        <div className="flex items-center gap-2">
          <SheetType type={type} />
          <SheetDifficulty difficulty={difficulty} />
        </div>
      </h3>

      <div className="text-sm">
        <span className="font-bold text-zinc-600">{version}</span>
      </div>
    </div>
  );
};
