import { OneShotRenderer } from "@gekichumai/oneshot";
import { Button, CircularProgress } from "@mui/material";
import { FC } from "react";
import satori from "satori";
import useSWR from "swr";
import { Entry } from "../../pages/RatingCalculator";
import { OneShotImageContent } from "./OneShotImageContent";

function quickStringHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export const OneShotImage: FC<{
  calculatedEntries: Entry[];
}> = ({ calculatedEntries }) => {
  const preload = useSWR(
    "oneshot:renderer",
    async () => {
      const renderer = new OneShotRenderer();
      await renderer.initialize();

      return {
        renderer,
        fontBold: await fetch(
          "https://shama.dxrating.net/fonts/SourceHanSans-Bold.otf",
        ).then((res) => res.arrayBuffer()),
        fontRegular: await fetch(
          "https://shama.dxrating.net/fonts/SourceHanSans-Regular.otf",
        ).then((res) => res.arrayBuffer()),
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  );

  const renderedURL = useSWR<string | null>(
    "oneshot:rendered:" +
      (preload.data ? "preload" : "no-preload") +
      quickStringHash(JSON.stringify(calculatedEntries)),
    async () => {
      if (!preload.data) return null;

      console.log("OneShotImageContent", OneShotImageContent);
      const el = <OneShotImageContent calculatedEntries={calculatedEntries} />;
      console.log("rendering", el);

      const svg = await satori(el, {
        width: 1500,
        height: 1500,
        fonts: [
          {
            name: "SourceHanSans",
            data: preload.data.fontBold,
            weight: 700,
          },
          {
            name: "SourceHanSans",
            data: preload.data.fontRegular,
            weight: 400,
          },
        ],
        tailwindConfig: {
          theme: {
            fontFamily: {
              sans: "SourceHanSans, sans-serif",
            },
          },
        },
      });
      return preload.data.renderer.render(svg);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  );

  return (
    <div className="flex flex-col gap-4">
      {import.meta.env.DEV && (
        <Button
          onClick={() => {
            renderedURL.mutate();
          }}
          variant="contained"
        >
          Rerender
        </Button>
      )}

      <div className="max-w-600px aspect-1 bg-gray-100 flex flex-col justify-center items-center b-1 b-solid rounded-md gap-2 overflow-hidden">
        {renderedURL.isValidating ? (
          <>
            <CircularProgress disableShrink />
            <div className="text-gray-400 px-8">
              Fetching images & rendering...
            </div>
          </>
        ) : renderedURL.error ? (
          <div className="text-red-400 p-8 select-none">
            {renderedURL.error.message}
          </div>
        ) : renderedURL.data ? (
          <img src={renderedURL.data} alt="oneshot" className="w-full h-auto" />
        ) : (
          <>
            <CircularProgress />
            <div className="text-gray-400 px-8">
              Fetching resvg renderer & fonts...
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OneShotImage;
