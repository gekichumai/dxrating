import { Modal } from "@mantine/core";
import { SwipeableDrawer } from "@mui/material";
import { FC, ReactNode, useEffect, useState } from "react";

import { useIsLargeDevice } from "../../utils/breakpoints";

export const ResponsiveDialog: FC<{
  open: boolean;
  setOpen: (open: boolean) => void;
  children?: () => ReactNode;
}> = ({ open, setOpen, children }) => {
  const isLargeDevice = useIsLargeDevice();
  const [internalOpen, setInternalOpen] = useState(false);

  // drawerOpen sets itself to true after internalOpen = true on the next render,
  // and sets itself to false immediately after internalOpen = false
  const [_drawerOpen, _setDrawerOpen] = useState(false);
  useEffect(() => {
    if (internalOpen) {
      _setDrawerOpen(true);
    } else {
      _setDrawerOpen(false);
    }
  }, [internalOpen]);
  const drawerOpen = _drawerOpen && open;

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        setInternalOpen(true);
      }, 0);
    } else {
      const timeout = setTimeout(() => {
        setInternalOpen(false);
      }, 1000); // Adjust the delay time as needed
      return () => clearTimeout(timeout);
    }
  }, [open]);

  return isLargeDevice ? (
    <Modal
      opened={open}
      onClose={() => setOpen(false)}
      size="lg"
      withCloseButton={false}
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 5,
      }}
      centered
    >
      {children?.()}
    </Modal>
  ) : (
    internalOpen && (
      <SwipeableDrawer
        disableDiscovery
        disableSwipeToOpen
        anchor="bottom"
        open={drawerOpen}
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
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-3 my-3" />
        <div className="overflow-auto h-full p-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {children?.()}
        </div>
      </SwipeableDrawer>
    )
  );
};
