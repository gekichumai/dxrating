import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grow,
} from "@mui/material";
import { FC, useState } from "react";
import { ListActions } from "react-use/lib/useList";
import { PlayEntry } from "../../RatingCalculatorAddEntryForm";

export const ClearButton: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Dialog
        TransitionComponent={Grow}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      >
        <DialogTitle>Clear all entries?</DialogTitle>
        <DialogContent className="min-w-[20rem]">
          <Alert severity="warning">
            <AlertTitle>Warning</AlertTitle>
            This will clear all entries.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false);
              modifyEntries.clear();
            }}
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>

      <Button
        color="error"
        variant="outlined"
        onClick={() => {
          setDialogOpen(true);
        }}
      >
        Clear...
      </Button>
    </>
  );
};
