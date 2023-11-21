import { DifficultyEnum, TypeEnum, VersionEnum } from "@gekichumai/dxdata";
import {
  Dialog,
  DialogContent,
  Grow,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  SwipeableDrawer,
} from "@mui/material";
import clsx from "clsx";
import { FC, HTMLAttributes, memo, useState } from "react";
import { FlattenedSheet } from "../songs";
import { useIsLargeDevice } from "../utils/breakpoints";
import { FadedImage } from "./FadedImage";
import {
  SheetDialogContent,
  SheetDialogContentProps,
} from "./SheetDialogContent";

export const SheetListItem: FC<
  {
    size?: "small" | "medium";
  } & SheetDialogContentProps
> = memo(({ size = "medium", ...props }) => {
  const [open, setOpen] = useState(false);
  const isLargeDevice = useIsLargeDevice();

  return (
    <>
      <SheetDialog open={open} setOpen={setOpen} {...props} />

      <ListItemButton
        disableGutters={!isLargeDevice}
        className={clsx(
          "w-full b-b-1 b-solid b-gray-200 cursor-pointer transition duration-500 !px-4",
          open && "!bg-zinc-300/80",
        )}
        onClick={() => setOpen(true)}
        sx={{
          borderRadius: 1,
        }}
      >
        <SheetListItemContent {...props} size={size} />
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

      <ListItemText className="ml-2 pr-20">
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
    <div className="font-bold tracking-tighter tabular-nums">
      <span className="text-lg text-zinc-600">{wholePart}.</span>
      <span className="text-xl">{decimalPart.toFixed(1).split(".")[1]}</span>
    </div>
  );
};

export const SheetDialog: FC<
  {
    open: boolean;
    setOpen: (open: boolean) => void;
  } & SheetDialogContentProps
> = ({ open, setOpen, ...props }) => {
  const isLargeDevice = useIsLargeDevice();

  return isLargeDevice ? (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="md"
      fullWidth
      TransitionComponent={Grow}
    >
      <DialogContent>
        <SheetDialogContent {...props} />
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
      <div className="overflow-auto h-full p-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {open && <SheetDialogContent {...props} />}
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
    title: "BASIC",
    color: "#22bb5b",
  },
  [DifficultyEnum.Advanced]: {
    title: "ADVANCED",
    color: "#fb9c2d",
  },
  [DifficultyEnum.Expert]: {
    title: "EXPERT",
    color: "#f64861",
  },
  [DifficultyEnum.Master]: {
    title: "MASTER",
    color: "#9e45e2",
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: "Re:MASTER",
    color: "#ba67f8",
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
    <img
      src={SHEET_TYPE_IMAGE[type]}
      className="w-70px h-26px"
      alt={type}
      draggable={false}
    />
  );
};

export const SheetImage: FC<{
  name: string;
  size?: "small" | "medium" | "large";
}> = ({ name, size = "medium" }) => {
  return (
    <FadedImage
      key={name}
      src={
        "https://dxrating-assets.imgg.dev/images/cover/v2/" +
        name.replace(/\.png$/, ".jpg")
      }
      className={clsx(
        "overflow-hidden",
        size === "small"
          ? "h-8 w-8 min-w-[2rem] min-h-[2rem] rounded-sm"
          : size === "medium"
          ? "h-12 w-12 min-w-[3rem] min-h-[3rem] rounded"
          : "h-16 w-16 min-w-[4rem] min-h-[4rem] rounded-lg",
      )}
      placeholderClassName="bg-slate-300/50"
      alt={name}
      loading="lazy"
    />
  );
};

export const SheetTitle: FC<{
  title: string;
  altNames?: string[];
  difficulty: DifficultyEnum;
  type: TypeEnum;
  version: VersionEnum;
  className?: string;
}> = ({ title, altNames, difficulty, type, version, className }) => {
  return (
    <div className="flex flex-col">
      <h3
        className={clsx(
          "flex flex-col md:flex-row md:items-start gap-x-2 gap-y-1",
          className,
        )}
      >
        <span className="translate-y-[-0.125rem] flex flex-col">
          <span className="leading-tight">{title}</span>
          {(altNames?.length ?? 0) > 0 && (
            <SheetAltNames altNames={altNames!} />
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <SheetType type={type} />
          <SheetDifficulty difficulty={difficulty} />
        </div>
      </h3>

      <div className="text-sm">
        <span className="text-zinc-600">ver. {version}</span>
      </div>
    </div>
  );
};

export const SheetAltNames: FC<{ altNames: string[] }> = ({ altNames }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="overflow-hidden"
      style={{
        mask: expanded
          ? ""
          : "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)",
        WebkitMask: expanded
          ? ""
          : "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)",
      }}
      onClick={() => setExpanded(true)}
    >
      <div
        className={clsx("text-sm text-slate-600", !expanded && "max-h-[7rem]")}
      >
        {altNames?.map((altName, i) => (
          <span className="inline-block whitespace-pre-line" key={i}>
            <span>{altName}</span>
            {i < altNames.length - 1 && (
              <span className="text-slate-400 mx-1 select-none">/</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};
