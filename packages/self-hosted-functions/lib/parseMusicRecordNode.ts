import { NODE_ELEMENT_NODE } from "./client";
import { Flag, MusicRecord } from "./record";

const MUSIC_RECORD_FLAG_MATCHERS: Record<Flag, string> = {
  fullCombo: "fc.png",
  "fullCombo+": "fcplus.png",
  allPerfect: "ap.png",
  "allPerfect+": "applus.png",
  syncPlay: "sync.png",
  fullSync: "fs.png",
  "fullSync+": "fsplus.png",
  fullSyncDX: "fsd.png",
  "fullSyncDX+": "fsdplus.png",
};

export function parseMusicRecordNode(record: Element): MusicRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const;
  const el = record as Element;

  const songId = el.querySelector(".music_name_block")?.textContent?.trim();
  const achievementRateString = el
    .querySelector(".music_score_block.w_112")
    ?.textContent?.trim();

  const achievementRate = parseInt(
    achievementRateString?.replace("%", "").replace(".", "") ?? ""
  );

  const typeIcon = el
    .querySelector(".music_kind_icon")
    ?.attributes.getNamedItem("src");
  let type = typeIcon?.value.match(/music_(standard|dx)\.png/)?.[1];

  (() => {
    if (el.querySelector(".music_kind_icon_dx")) {
      type = "dx";
    }
    if (el.querySelector(".music_kind_icon_standard")) {
      type = "standard";
    }
  })();

  const difficultyIcon = el
    .querySelector(".h_20.f_l")
    ?.attributes.getNamedItem("src");
  const difficulty = difficultyIcon?.value.match(/diff_(.*)\.png/)?.[1];

  // overrides
  if (difficulty === "utage") {
    type = "utage";
  }

  const dxScorePair = (
    el.querySelector(".music_score_block.w_190")?.textContent?.trim() ?? ""
  )
    .split(" / ")
    .flatMap((el) => {
      try {
        return [parseInt(el.replace(",", ""))];
      } catch (_e) {
        return [] as const;
      }
    }) as [number, number];

  if (dxScorePair.length !== 2) {
    // console.warn("[parseNode] invalid dx score pair:", dxScorePair);
    return [] as const;
  }

  if (!songId || !type || !difficulty) {
    // console.warn(
    //   "[parseNode] missing required fields:",
    //   songId,
    //   type,
    //   difficulty
    // );
    return [] as const;
  }

  const flags: Flag[] = [];

  const flagImages = el.querySelectorAll("form img.f_r");
  for (const flagImage of Array.from(flagImages)) {
    if (flagImage.nodeType !== NODE_ELEMENT_NODE) return [] as const;
    const el = flagImage as Element;
    const src = el.attributes.getNamedItem("src")?.value;
    if (!src) {
      console.warn(
        "[parseNode] missing src attribute on flag image",
        el.innerHTML
      );
      continue;
    }
    const flag = (Object.keys(MUSIC_RECORD_FLAG_MATCHERS) as Flag[]).find(
      (key) => src.includes(MUSIC_RECORD_FLAG_MATCHERS[key])
    ) as Flag | undefined;
    if (flag) {
      flags.push(flag);
    }
  }

  return [
    {
      sheet: {
        songId,
        type,
        difficulty,
      },
      achievement: {
        rate: achievementRate,
        dxScore: {
          achieved: dxScorePair[0],
          total: dxScorePair[1],
        },
        flags,
      },
    } as MusicRecord,
  ] as const;
}
