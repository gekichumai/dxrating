import { DifficultyEnum, TypeEnum } from "@gekichumai/dxdata";
import {
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
} from "@mui/material";
import clsx from "clsx";
import { FC, HTMLAttributes, ImgHTMLAttributes, memo, useState } from "react";
import toast from "react-hot-toast";
import { match } from "ts-pattern";
import MdiComment from "~icons/mdi/comment";
import { DIFFICULTIES } from "../models/difficulties";
import { FlattenedSheet } from "../songs";
import { useIsLargeDevice } from "../utils/breakpoints";
import { FadedImage } from "./global/FadedImage";
import { ResponsiveDialog } from "./global/ResponsiveDialog";
import {
  SheetDialogContent,
  SheetDialogContentProps,
} from "./sheet/SheetDialogContent";

export const SheetListItem: FC<
  {
    size?: "small" | "medium";
  } & SheetDialogContentProps
> = memo(({ size = "medium", ...props }) => {
  const [open, setOpen] = useState(false);
  const isLargeDevice = useIsLargeDevice();

  return (
    <>
      <ResponsiveDialog open={open} setOpen={setOpen}>
        {() => <SheetDialogContent {...props} />}
      </ResponsiveDialog>

      <ListItemButton
        disableGutters={!isLargeDevice}
        className={clsx(
          "w-full cursor-pointer transition duration-500 hover:duration-25 !px-4",
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
          sheet={sheet}
          className={clsx(
            "font-bold",
            size === "small" ? "text-sm" : "text-lg",
          )}
        />
      </ListItemText>

      <ListItemSecondaryAction>
        {sheet.isTypeUtage ? (
          <span className="font-bold tracking-tighter tabular-nums text-lg text-zinc-600">
            {sheet.level}
          </span>
        ) : (
          <SheetInternalLevelValue value={sheet.internalLevelValue} />
        )}
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

export const SheetDifficulty: FC<{ difficulty?: DifficultyEnum }> = ({
  difficulty,
}) => {
  const difficultyConfig = difficulty ? DIFFICULTIES[difficulty] : undefined;
  return difficultyConfig ? (
    <span
      className="rounded-full px-2 text-sm shadow-[0.0625rem_0.125rem_0_0_#0b38714D] leading-relaxed translate-y-[-0.125rem] text-white"
      style={{ backgroundColor: difficultyConfig.color }}
    >
      {difficultyConfig.title}
    </span>
  ) : null;
};

const SHEET_TYPE_IMAGE = {
  [TypeEnum.DX]: "https://shama.dxrating.net/images/type_dx.png",
  [TypeEnum.STD]: "https://shama.dxrating.net/images/type_sd.png",
  [TypeEnum.UTAGE]:
    "https://shama.dxrating.net/images/chart-type/type_utage.png",
};

const SheetType: FC<{ type: TypeEnum; difficulty: DifficultyEnum }> = ({
  type,
  difficulty,
}) => {
  const isUtage = type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P;

  if (isUtage) {
    const isUtage2P = type === TypeEnum.UTAGE2P;

    return (
      <>
        <div
          className="h-26px w-95.875px flex items-center justify-center text-center select-none"
          style={{
            background: `url(${
              SHEET_TYPE_IMAGE[TypeEnum.UTAGE]
            }) no-repeat center`,
            backgroundSize: "contain",
          }}
        >
          <span className="text-shadow-[0_0_0.5rem_#FFFFFF99] text-white text-xs">
            {difficulty.replace(/[【】]/g, "")}
          </span>
        </div>
        {isUtage2P && (
          <img
            src="https://shama.dxrating.net/images/chart-type/type_utage2p_endadornment.png"
            className="h-26px w-95.875px ml-[-27px] touch-callout-none"
            alt={type}
            draggable={false}
          />
        )}
      </>
    );
  }

  return (
    <img
      key={type}
      src={SHEET_TYPE_IMAGE[type]}
      className="h-26px w-70px touch-callout-none"
      alt={type}
      draggable={false}
    />
  );
};

export const SheetImage: FC<
  ImgHTMLAttributes<HTMLImageElement> & {
    name: string;
    size?: "small" | "medium" | "large";
  }
> = ({ name, size = "medium", ...props }) => {
  return (
    <FadedImage
      key={name}
      src={"https://shama.dxrating.net/images/cover/v2/" + name}
      className={clsx(
        "overflow-hidden",
        match(size)
          .with("small", () => "h-8 w-8 min-w-[2rem] min-h-[2rem] rounded-sm")
          .with("medium", () => "h-12 w-12 min-w-[3rem] min-h-[3rem] rounded")
          .with("large", () => "h-16 w-16 min-w-[4rem] min-h-[4rem] rounded-lg")
          .exhaustive(),
      )}
      placeholderClassName="bg-slate-300/50"
      alt={name}
      loading="lazy"
      {...props}
    />
  );
};

export const SheetTitle: FC<{
  sheet: FlattenedSheet;

  enableAltNames?: boolean;
  enableClickToCopy?: boolean;

  className?: string;
}> = ({ sheet, enableAltNames, enableClickToCopy, className }) => {
  const { title, searchAcronyms, difficulty, type, version } = sheet;
  return (
    <div className="flex flex-col">
      <h3
        className={clsx(
          "flex flex-col md:flex-row md:items-start gap-x-2 gap-y-1",
          className,
        )}
      >
        <span className="flex flex-col">
          <span
            className="leading-tight cursor-pointer"
            {...(enableClickToCopy && {
              onClick: () => {
                navigator.clipboard.writeText(title);
                toast.success("Copied title to clipboard", {
                  id: `copy-sheet-title-${title}`,
                });
              },
              title: "Click to copy",
            })}
          >
            {title}
          </span>
          {enableAltNames && (searchAcronyms?.length ?? 0) > 0 && (
            <SheetAltNames altNames={searchAcronyms!} />
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <SheetType type={type} difficulty={difficulty} />
          <SheetDifficulty difficulty={difficulty} />
        </div>
      </h3>

      {sheet.isTypeUtage && (
        <span className="text-sm text-zinc-600 px-1.5 py-0.5 gap-1 bg-amber/75 inline-flex self-start rounded-md">
          <MdiComment className="h-3 w-3 flex-shrink-0 mt-1.125" />
          <span>{sheet.comment}</span>
        </span>
      )}

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
      className={clsx(
        "text-sm text-slate-600 overflow-hidden mb-1",
        !expanded && "max-h-[7rem]",
      )}
      style={{
        mask: expanded
          ? undefined
          : "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)",
        WebkitMask: expanded
          ? undefined
          : "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)",
      }}
      onClick={() => setExpanded(true)}
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
  );
};
