import { OneShotRenderer } from "@gekichumai/oneshot";
import { Button } from "@mui/material";
import { FC } from "react";
import satori from "satori";
import useSWR from "swr";
import { Entry } from "../pages/RatingCalculator";
import { OneShotImageContent } from "./OneShotImageContent";

function quickStringHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export const OneShotImage: FC<{
  entries: Entry[];
}> = ({ entries }) => {
  const preload = useSWR(
    "_oneshot_renderer",
    async () => {
      const renderer = new OneShotRenderer();
      await renderer.initialize();

      const torusFont = await fetch("/Torus-Regular.ttf").then((res) =>
        res.arrayBuffer(),
      );
      console.log("renderer", renderer);

      return { renderer, torusFont };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  );

  const renderedURL = useSWR<string | null>(
    "_oneshot_rendered_" +
      (preload.data ? "preload" : "no-preload") +
      quickStringHash(JSON.stringify(entries)),
    async () => {
      if (!preload.data) return null;

      const el = <OneShotImageContent entries={entries} />;
      console.log(el);
      const svg = await satori(el, {
        width: 1200,
        height: 1200,
        fonts: [
          {
            name: "Torus",
            data: preload.data.torusFont,
          },
        ],
        tailwindConfig: {
          theme: {
            fontFamily: {
              rounded: "Torus",
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
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => {
          renderedURL.mutate();
        }}
        variant="contained"
      >
        Rerender
      </Button>

      {renderedURL.isLoading ? (
        <div className="w-600px h-600px bg-gray-100 flex justify-center items-center rounded-md">
          <div className="text-gray-400">Rendering</div>
        </div>
      ) : renderedURL.error ? (
        <div className="w-600px h-600px bg-gray-100 flex justify-center items-center rounded-md">
          <div className="text-red-400">{renderedURL.error.message}</div>
        </div>
      ) : renderedURL.data ? (
        <img
          src={renderedURL.data}
          alt="oneshot"
          className="w-600px h-600px bg-gray-100 rounded-md b-1 b-solid b-gray-3"
        />
      ) : (
        <div className="w-600px h-600px bg-gray-100 flex justify-center items-center rounded-md">
          <div className="text-gray-400">
            Error: no rendered URL and no error returned
          </div>
        </div>
      )}
    </div>
  );
};
