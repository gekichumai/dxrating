import { Alert, Button } from "@mantine/core";
import { modals } from "@mantine/modals";
import { FC } from "react";
import { ListActions } from "react-use/lib/useList";

import { PlayEntry } from "../RatingCalculatorAddEntryForm";

export const ClearButton: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
  return (
    <Button
      color="error"
      variant="outlined"
      onClick={() => {
        modals.openConfirmModal({
          title: "Please confirm your action",
          children: (
            <Alert color="yellow" variant="filled" title="Warning">
              This will clear all entries.
            </Alert>
          ),
          labels: { confirm: "Clear", cancel: "Cancel" },
          onCancel: () => console.log("Cancel"),
          onConfirm: () => {
            modifyEntries.clear();
          },
        });
      }}
    >
      Clear
    </Button>
  );
};
