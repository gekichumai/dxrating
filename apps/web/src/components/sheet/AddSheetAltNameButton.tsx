import { Button, Dialog, Grow, TextField } from "@mui/material";
import { FC, useState } from "react";
import toast from "react-hot-toast";
import { useAsyncFn } from "react-use";

import { useAuth } from "../../models/context/AuthContext";
import { supabase } from "../../models/supabase";
import { useServerAliases } from "../../models/useServerAliases";
import { FlattenedSheet } from "../../songs";
import { isBuildPlatformApp } from "../../utils/env";
import { MotionButtonBase } from "../../utils/motion";

import { SheetListItemContent } from "./SheetListItem";

import IconMdiPlus from "~icons/mdi/plus";

export const AddSheetAltNameButton: FC<{ sheet: FlattenedSheet }> = ({
  sheet,
}) => {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();

  const [newAltName, setNewAltName] = useState("");
  const { mutate } = useServerAliases();

  const [{ loading }, handleAddAltName] = useAsyncFn(async () => {
    if (!session) return;
    await supabase
      .from("song_aliases")
      .insert([
        {
          song_id: sheet.songId,
          name: newAltName.trim(),
        },
      ])
      .select()
      .then((res) => {
        if (res.error) {
          toast.error("Failed to add alias: " + res.error.message);
          return;
        }

        toast.success("Added alias: " + newAltName.trim());
        setOpen(false);
        setNewAltName("");
      });
    mutate();
  }, [newAltName, sheet.songId, mutate]);

  return (
    <>
      <MotionButtonBase
        className="h-6 border-1 border-solid border-gray-200 rounded-lg inline-flex self-start items-center justify-center px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 hover:border-gray-300 active:bg-gray-300 active:border-gray-400 transition mt-2"
        onClick={() => {
          setOpen(true);
        }}
      >
        <IconMdiPlus className="h-4 w-4" />

        <span className="ml-1 text-xs">Add New Alias</span>
      </MotionButtonBase>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        TransitionComponent={Grow}
        maxWidth="md"
        classes={{
          paper: "w-full",
        }}
      >
        <div className="flex flex-col gap-2 p-4 relative w-full">
          <div className="text-lg font-bold">Add an Alias</div>
          <div className="text-lg">
            <SheetListItemContent sheet={sheet} />
          </div>

          <div className="flex flex-col gap-2">
            <TextField
              label="Add alias"
              variant="outlined"
              value={newAltName}
              onChange={(e) => setNewAltName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddAltName();
                }
              }}
              data-attr="add-alias-input"
            />

            <Button
              variant="contained"
              color="primary"
              onClick={handleAddAltName}
              startIcon={<IconMdiPlus />}
              disabled={
                newAltName.trim().length === 0 ||
                newAltName.trim().length > 100 ||
                !session ||
                loading
              }
              type="submit"
            >
              {loading ? "Adding..." : "Add Alias"}
            </Button>
          </div>

          {!session && (
            <div className="text-gray-500 absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-80 p-8 z-1">
              {isBuildPlatformApp ? (
                <div className="text-center font-bold">
                  Adding alias is currently unavailable in the app.
                </div>
              ) : (
                <div className="text-center font-bold">
                  Login or Register an account to add an alias.
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};
