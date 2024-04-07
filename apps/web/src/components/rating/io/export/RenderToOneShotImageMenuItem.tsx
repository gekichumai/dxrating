import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { FC, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import IconMdiImage from "~icons/mdi/image";
import IconMdiNewBox from "~icons/mdi/new-box";
import { useRatingCalculatorContext } from "../../../../models/RatingCalculatorContext";
import { useAppContextDXDataVersion } from "../../../../models/context/useAppContext";

const useElapsedTime = (isLoading: boolean) => {
  const startTime = useRef<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startTime.current = Date.now();
      setElapsedTime(null);
      timer.current = window.setInterval(() => {
        if (startTime.current) {
          setElapsedTime(Date.now() - startTime.current);
        }
      }, 1 / 60);
    } else {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    }

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, [isLoading]);

  return elapsedTime;
};

const RenderToOneShotImageDialogContent = () => {
  const { entries } = useRatingCalculatorContext();
  const version = useAppContextDXDataVersion();
  const { data, isValidating, error } = useSWR(
    `miruku:///functions/oneshot-renderer/v0?pixelated=1&data=${JSON.stringify(
      entries,
    )}&version=${version}`,
    async () => {
      const response = await fetch(
        "https://miruku.dxrating.net/functions/render-oneshot/v0?pixelated=1",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version,
            entries,
          }),
        },
      );
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );
  const elapsedTime = useElapsedTime(isValidating);

  return (
    <>
      <DialogTitle className="text-lg font-bold pb-0">
        Render as OneShot Image
      </DialogTitle>

      <DialogContent classes={{ root: "!pt-4" }}>
        <DialogContentText>
          {isValidating ? (
            <div className="flex flex-col relative">
              <div className="aspect-[3/2] w-full bg-gray-300 rounded-md animate-pulse" />

              <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center p-4">
                <CircularProgress />

                <div className="text-lg font-bold tracking-tight">
                  Rendering...
                </div>

                <div className="text-base font-bold tabular-nums tracking-tight">
                  {elapsedTime
                    ? `${(elapsedTime / 1000).toFixed(1)}s`
                    : "Calculating..."}
                </div>

                <div className="text-sm">
                  This may take a while depending on the current server load;
                  typically rendering will finish within 10 seconds.
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="text-red-500">
              An error occurred while rendering the image: {error.message}
            </div>
          ) : (
            <img
              src={data}
              alt="OneShot Image"
              className="shadow rounded-md"
              style={{
                boxShadow: `0 0 8px hsl(0deg 0% 0% / 0.25),
                0 1px 1px hsl(0deg 0% 0% / 0.075),
      0 2px 2px hsl(0deg 0% 0% / 0.075),
      0 4px 4px hsl(0deg 0% 0% / 0.075),
      0 8px 8px hsl(0deg 0% 0% / 0.075),
      0 16px 16px hsl(0deg 0% 0% / 0.075)`,
              }}
            />
          )}

          <div className="text-gray-500 mt-4 flex flex-col gap-1">
            <div className="text-sm font-bold">
              Long-press or right-click the image to save it to your device.
            </div>

            <div className="text-xs">
              This feature is in beta and may not work as expected. Please feel
              free to report any issues or feedback to the developer :D
            </div>
          </div>
        </DialogContentText>
      </DialogContent>
    </>
  );
};

export const RenderToOneShotImageMenuItem: FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <MenuItem onClick={() => setOpen(true)}>
        <ListItemIcon>
          <IconMdiImage />
        </ListItemIcon>
        <ListItemText
          primary="Render as OneShot Image..."
          secondary={
            <div className="flex items-center gap-1">
              <IconMdiNewBox />
              <span>Experimental</span>
            </div>
          }
        />
      </MenuItem>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <RenderToOneShotImageDialogContent />
      </Dialog>
    </>
  );
};
