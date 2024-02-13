import { VersionEnum } from "@gekichumai/dxdata";
import { DevTool } from "@hookform/devtools";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grow,
  Paper,
} from "@mui/material";
import clsx from "clsx";
import { FC, useContext, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import MdiBeta from "~icons/mdi/beta";
import MdiTrashCan from "~icons/mdi/trash-can";
import { SheetDetailsContext } from "../../models/context/SheetDetailsContext";
import { FlattenedSheet } from "../../songs";
import { SheetSortSelect } from "./SheetSortSelect";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";
import { SheetVersionFilter } from "./filters/SheetVersionFilter";
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
  },
  sorts: [
    {
      descriptor: "releaseDate",
      direction: "desc",
    },
  ],
});

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const defaultValues = useMemo(() => {
    const alreadySaved = window.localStorage.getItem(
      "dxrating-sheet-sort-filter",
    );
    if (alreadySaved) {
      try {
        return JSON.parse(alreadySaved) as SheetSortFilterForm;
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

  return (
    <FormProvider {...methods}>
      <SheetSortFilterFormListener onChange={onChange} />
      <SheetSortFilterForm />
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
        startIcon={<MdiTrashCan />}
        onClick={() => setOpenDialog(true)}
      >
        {t("sheet:sort-and-filter.reset")}
      </Button>
    </>
  );
};

const SheetSortFilterForm = () => {
  const { t } = useTranslation(["sheet"]);
  const { queryActive } = useContext(SheetDetailsContext);
  const { control, reset } = useFormContext<SheetSortFilterForm>();

  return (
    <>
      {import.meta.env.DEV && <DevTool control={control} />}
      <Paper className="w-full flex flex-col">
        <div className="px-4 py-2 w-full flex items-center bg-gray-100 rounded-t-xl">
          <div className="text-xl font-bold tracking-tight leading-none">
            {t("sheet:sort-and-filter.title")}
          </div>
          <div className="bg-gray-200 border border-solid border-gray-300 rounded-full px-2 py-1 text-xs ml-2 flex items-center gap-1 select-none leading-none">
            <MdiBeta />
            <span>Beta</span>
          </div>
          <div className="flex-1" />

          <SheetSortFilterFormReset
            onReset={() => {
              reset(getDefaultSheetSortFilterForm());
              window.localStorage.removeItem("dxrating-sheet-sort-filter");
            }}
          />
        </div>

        <div className="p-2 w-full flex flex-col gap-4">
          <div className="p-2 flex flex-col gap-4">
            <div className="text-xl font-bold tracking-tight">
              {t("sheet:filter.title")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <SheetVersionFilter control={control} />
              <SheetInternalLevelFilter control={control} />
            </div>
          </div>

          <div
            className={clsx(
              "p-2 flex flex-col gap-4 rounded-lg",
              queryActive && "bg-gray-200 pointer-events-none saturation-0",
            )}
          >
            <div className="text-xl font-bold tracking-tight flex items-center">
              <span>{t("sheet:sort.title")}</span>
              {queryActive && (
                <div className="px-1.5 py-0.5 rounded-full bg-gray-300 text-xs ml-2">
                  {t("sheet:sort.temporarily-disabled")}
                </div>
              )}
            </div>
            <SheetSortSelect control={control} />
          </div>
        </div>
      </Paper>
    </>
  );
};
