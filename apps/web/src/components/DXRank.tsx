import clsx from "clsx";
import { FC } from "react";
import imageRankA from "../assets/images/rank/a.png";
import imageRankAA from "../assets/images/rank/aa.png";
import imageRankAAA from "../assets/images/rank/aaa.png";
import imageRankB from "../assets/images/rank/b.png";
import imageRankBB from "../assets/images/rank/bb.png";
import imageRankBBB from "../assets/images/rank/bbb.png";
import imageRankC from "../assets/images/rank/c.png";
import imageRankD from "../assets/images/rank/d.png";
import imageRankS from "../assets/images/rank/s.png";
import imageRankSP from "../assets/images/rank/sp.png";
import imageRankSS from "../assets/images/rank/ss.png";
import imageRankSSP from "../assets/images/rank/ssp.png";
import imageRankSSS from "../assets/images/rank/sss.png";
import imageRankSSSP from "../assets/images/rank/sssp.png";

const RANK_IMAGE_MAP = {
  sssp: imageRankSSSP,
  sss: imageRankSSS,
  ssp: imageRankSSP,
  ss: imageRankSS,
  sp: imageRankSP,
  s: imageRankS,
  aaa: imageRankAAA,
  aa: imageRankAA,
  a: imageRankA,
  bbb: imageRankBBB,
  bb: imageRankBB,
  b: imageRankB,
  c: imageRankC,
  d: imageRankD,
};

export const DXRank: FC<{ rank?: string | null; className?: string }> = ({
  rank,
  className,
}) => {
  const image = RANK_IMAGE_MAP[rank as keyof typeof RANK_IMAGE_MAP] as
    | string
    | undefined;

  return image ? (
    <img src={image} className={clsx("aspect-w-128 aspect-h-60", className)} />
  ) : (
    <div
      className={clsx(
        "aspect-w-128 aspect-h-60 bg-gray-200 rounded",
        className,
      )}
    />
  );
};
