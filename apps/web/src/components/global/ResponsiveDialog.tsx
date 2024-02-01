import { Dialog, DialogContent, Grow, SwipeableDrawer } from "@mui/material";
import { FC, PropsWithChildren } from "react";
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
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 my-3" />
          <div className="overflow-auto h-full p-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {children}
          </div>
        </SwipeableDrawer>
      )}
    </>
  );
};
