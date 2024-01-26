import { Song } from "@gekichumai/dxdata";

export function getInternalIdByType(
  type: "std" | "dx",
  song: Song,
): number | undefined {
  return song.internalId?.[type];
}
