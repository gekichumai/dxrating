import {
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
} from "@mui/material";
import clsx from "clsx";
import { FC, memo, useState } from "react";
import { Drawer } from "vaul";
import imageTypeDX from "../assets/images/type_dx.png";
import imageTypeSD from "../assets/images/type_sd.png";
import { DifficultyEnum, FlattenedSheet, TypeEnum } from "../songs";
import { SheetDialog } from "./SheetDialog";

export const SheetCard: FC<{ sheet: FlattenedSheet }> = memo(({ sheet }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Drawer.Root
        open={open}
        onClose={() => setOpen(false)}
        onOpenChange={(open) => setOpen(open)}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40" />
          <Drawer.Content className="bg-zinc-100 flex flex-col rounded-t-[10px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-[1]">
            <div className="p-4 bg-white rounded-t-[10px] flex-1">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mb-8" />
              {open && <SheetDialog sheet={sheet} />}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <ListItemButton
        className={clsx(
          "flex items-center w-full b-b-1 b-solid b-gray-200 p-1 gap-2 tabular-nums cursor-pointer transition rounded duration-500",
          open && "!bg-zinc-300/80",
        )}
        onClick={() => setOpen(true)}
      >
        <SheetImage name={sheet.imageName} />

        <ListItemText>
          <SheetTitle
            title={sheet.title}
            difficulty={sheet.difficulty}
            type={sheet.type}
            className="text-lg font-bold ml-2"
          />
        </ListItemText>

        <ListItemSecondaryAction>
          <SheetInternalLevelValue value={sheet.internalLevelValue} />
        </ListItemSecondaryAction>
      </ListItemButton>
    </>
  );
});

const SheetInternalLevelValue: FC<{ value: number }> = ({ value }) => {
  const wholePart = Math.floor(value);
  const decimalPart = value - wholePart;

  return (
    <div className="font-mono font-bold tracking-tighter">
      <span className="text-md">{wholePart}</span>
      <span className="text-xl">.{decimalPart.toFixed(1).split(".")[1]}</span>
    </div>
  );
};

const DIFFICULTIES = {
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
      className="rounded-full px-2 py-1 text-sm b-2 b-solid b-white shadow"
      style={{ backgroundColor: difficultyConfig.color }}
    >
      {difficultyConfig.title}
    </span>
  );
};

const SHEET_TYPE_IMAGE = {
  [TypeEnum.DX]: imageTypeDX,
  [TypeEnum.SD]: imageTypeSD,
};

const SheetType: FC<{ type: TypeEnum }> = ({ type }) => {
  return (
    <img src={SHEET_TYPE_IMAGE[type]} className="w-70px h-26px" alt={type} />
  );
};

export const SheetImage: FC<{ name: string }> = ({ name }) => {
  return (
    <img
      key={name}
      src={"https://dp4p6x0xfi5o9.cloudfront.net/maimai/img/cover/" + name}
      loading="lazy"
      className="h-12 w-12 rounded bg-slate-100"
    />
  );
};

export const SheetTitle: FC<{
  title: string;
  difficulty: DifficultyEnum;
  type: TypeEnum;
  className?: string;
}> = ({ title, difficulty, type, className }) => {
  return (
    <h1 className={clsx("flex items-center gap-2", className)}>
      <span>{title}</span>
      <SheetDifficulty difficulty={difficulty} />
      <SheetType type={type} />
    </h1>
  );
};
