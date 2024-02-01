import { Dialog, DialogContent, Grow } from "@mui/material";
import { FC, PropsWithChildren } from "react";
import { Drawer } from "vaul";
import { useIsLargeDevice } from "../../utils/breakpoints";

import { useEffect, useState } from "react";

export const ResponsiveDialog: FC<
  PropsWithChildren<{
    open: boolean;
    setOpen: (open: boolean) => void;
  }>
> = ({ open, setOpen, children }) => {
  const isLargeDevice = useIsLargeDevice();
  const [internalOpen, setInternalOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setInternalOpen(true);
    } else {
      const timeout = setTimeout(() => {
        setInternalOpen(false);
      }, 1000); // Adjust the delay time as needed
      return () => clearTimeout(timeout);
    }
  }, [open]);

  return isLargeDevice ? (
    <>
      {internalOpen && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          maxWidth="md"
          fullWidth
          TransitionComponent={Grow}
        >
          <DialogContent>{children}</DialogContent>
        </Dialog>
      )}
    </>
  ) : (
    <>
      {internalOpen && (
        <Drawer.NestedRoot open={open} onClose={() => setOpen(false)}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40" />
            <Drawer.Content className="bg-zinc-100 flex flex-col rounded-t-[10px] h-[90%] mt-24 fixed bottom-0 left-0 right-0 z-10">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 my-3" />
              <div className="overflow-auto h-full p-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {children}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.NestedRoot>
      )}
    </>
  );
};
