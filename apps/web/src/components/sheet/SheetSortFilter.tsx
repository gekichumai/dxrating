import { CategoryEnum, VersionEnum } from "@gekichumai/dxdata";
import { DevTool } from "@hookform/devtools";
import {
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grow,
  Paper,
} from "@mui/material";
import * as Collapsible from "@radix-ui/react-collapsible";
import clsx from "clsx";
import {
  FC,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useEffectOnce } from "react-use";

import { SheetDetailsContext } from "../../models/context/SheetDetailsContext";
import { FlattenedSheet } from "../../songs";

import { SheetCategoryFilter } from "./filters/SheetCategoryFilter";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";
import { SheetTagFilter } from "./filters/SheetTagFilter";
import { SheetVersionFilter } from "./filters/SheetVersionFilter";
import { SheetSortSelect } from "./SheetSortSelect";

import MdiChevronDownIcon from "~icons/mdi/chevron-down";

export interface SortPredicate {
  descriptor: keyof FlattenedSheet;
  direction: "asc" | "desc";
}

export interface SheetSortFilterForm {
  filters: {
    versions: VersionEnum[];
    internalLevelValue?: {
      min: number;
      max: number;
    };
    tags: number[];
    categories: CategoryEnum[];
  };
  sorts: SortPredicate[];
}

export const getDefaultSheetSortFilterForm = (): SheetSortFilterForm => ({
  filters: {
    versions: Object.values(VersionEnum),
    internalLevelValue: {
      min: 1.0,
      max: 15.0,
    },
    tags: [],
    categories: Object.values(CategoryEnum),
  },
  sorts: [
    {
      descriptor: "releaseDate",
      direction: "desc",
    },
  ],
});

export const applySheetSortFilterFormPatches = (
  alreadySaved: SheetSortFilterForm,
): SheetSortFilterForm => {
  if (alreadySaved.filters.tags === undefined) {
    alreadySaved.filters.tags = [];
  }

  if (alreadySaved.filters.categories === undefined) {
    alreadySaved.filters.categories = Object.values(CategoryEnum);
  }

  // if (alreadySaved.filters.difficulties === undefined) {
  //   alreadySaved.filters.difficulties = [
  //     DifficultyEnum.Basic,
  //     DifficultyEnum.Advanced,
  //     DifficultyEnum.Expert,
  //     DifficultyEnum.Master,
  //     DifficultyEnum.ReMaster,
  //   ];
  // }

  return alreadySaved;
};

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const defaultValues = useMemo(() => {
    const alreadySaved = window.localStorage.getItem(
      "dxrating-sheet-sort-filter",
    );
    if (alreadySaved) {
      try {
        return applySheetSortFilterFormPatches(
          JSON.parse(alreadySaved) as SheetSortFilterForm,
        );
      } catch (e) {
        console.warn("Failed to parse saved sort filter", e);
      }
    }

    return getDefaultSheetSortFilterForm();
  }, []);

  const methods = useForm<SheetSortFilterForm>({
    mode: "onChange",
    defaultValues,
  });

  useEffectOnce(() => {
    onChange?.(methods.getValues());
  });

  return (
    <FormProvider {...methods}>
      <SheetSortFilterFormListener onChange={onChange} />
      <SheetSortFilterFormContent />
    </FormProvider>
  );
};

const SheetSortFilterFormListener: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const { watch } = useFormContext<SheetSortFilterForm>();

  useEffect(() => {
    watch((data) => {
      if (data.filters || data.sorts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange?.(data as any);

        window.localStorage.setItem(
          "dxrating-sheet-sort-filter",
          JSON.stringify(data),
        );
      }
    });
  }, [onChange, watch]);

  return null;
};

const SheetSortFilterFormReset: FC<{
  onReset: () => void;
}> = ({ onReset }) => {
  const { t } = useTranslation(["sheet"]);
  const [openDialog, setOpenDialog] = useState(false);

  return (
    <>
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        TransitionComponent={Grow}
      >
        <DialogTitle>Reset Sort and Filter Settings</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset the sort and filter settings?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenDialog(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenDialog(false);
              onReset();
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Button
        variant="outlined"
        color="error"
        onClick={() => setOpenDialog(true)}
        size="small"
      >
        {t("sheet:sort-and-filter.reset")}
      </Button>
    </>
  );
};

const SheetSortFilterFormContent = () => {
  const { t } = useTranslation(["sheet"]);
  const { queryActive } = useContext(SheetDetailsContext);
  const { control, reset } = useFormContext<SheetSortFilterForm>();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const collapsibleInner = (
    <div className="p-2 w-full flex flex-col gap-4">
      <div className="m-2 flex flex-col gap-4">
        <div className="flex">
          <SheetSortFilterFormReset
            onReset={() => {
              reset(getDefaultSheetSortFilterForm());
              window.localStorage.removeItem("dxrating-sheet-sort-filter");
            }}
          />
        </div>

        <div className="text-xl font-bold tracking-tighter">
          <span className="whitespace-nowrap">{t("sheet:filter.title")}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SheetCategoryFilter control={control} />
          <SheetVersionFilter control={control} />
          <SheetTagFilter control={control} />
          <SheetInternalLevelFilter control={control} />
        </div>
      </div>

      <div
        className={clsx(
          "p-2 flex flex-col gap-4 rounded-lg",
          queryActive &&
            "bg-gray-200 pointer-events-none saturation-0 shadow-[inset_0_1px_8px] shadow-gray-300",
        )}
      >
        <div className="text-xl font-bold tracking-tighter flex items-center">
          <div className="whitespace-nowrap leading-none">
            {t("sheet:sort.title")}
          </div>
          {queryActive && (
            <div className="px-1.5 py-1 rounded-md bg-gray-200 text-xs ml-2 leading-tight tracking-tight text-zinc-600 shadow-[0_1px_8px] shadow-gray-300">
              {t("sheet:sort.temporarily-disabled")}
            </div>
          )}
        </div>
        <SheetSortSelect control={control} />
      </div>
    </div>
  );

  return (
    <>
      {import.meta.env.DEV && <DevTool control={control} />}
      <Collapsible.Root
        open={expanded}
        onOpenChange={(expanded) =>
          startTransition(() => setExpanded(expanded))
        }
        className="w-full"
      >
        <Paper className="w-full flex flex-col overflow-hidden">
          <Collapsible.Trigger asChild>
            <ButtonBase
              className={clsx(
                "px-4 w-full flex items-center transition-all duration-300",
                expanded ? "bg-gray-200 py-4" : "bg-gray-100 py-3",
              )}
            >
              <div className="text-xl font-bold tracking-tight leading-none">
                {t("sheet:sort-and-filter.title")}
              </div>
              {pending && (
                <CircularProgress disableShrink className="ml-2 !h-4 !w-4" />
              )}
              <div className="flex-1" />
              <MdiChevronDownIcon
                className={clsx(
                  "w-6 h-6 transition-transform",
                  expanded && "transform rotate-180",
                )}
              />
            </ButtonBase>
          </Collapsible.Trigger>

          <Collapsible.Content className="radix__collapsible-content">
            {collapsibleInner}
          </Collapsible.Content>
        </Paper>
      </Collapsible.Root>
    </>
  );
};
