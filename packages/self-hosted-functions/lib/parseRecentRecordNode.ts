import { Flag, RecentRecord } from "./record";
import { NODE_ELEMENT_NODE } from "./client";

const RECENT_RECORD_FLAG_MATCHERS: Record<Flag, string> = {
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

export function parseRecentRecordNode(record: Element): RecentRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const;
  const el = record as Element;

  const songId = el.querySelector(".basic_block.break")?.textContent?.trim();
  const achievementRateString = el
    .querySelector(".playlog_achievement_txt")
    ?.textContent?.trim();

  const achievementRate = parseInt(
    achievementRateString?.replace("%", "").replace(".", "") ?? ""
  );

  const typeIcon = el
    .querySelector(".playlog_music_kind_icon")
    ?.attributes.getNamedItem("src");
  let type = typeIcon?.value.match(/music_(standard|dx)\.png/)?.[1];

  const difficultyIcon = el
    .querySelector(".playlog_diff")
    ?.attributes.getNamedItem("src");
  const difficulty = difficultyIcon?.value.match(/diff_(.*)\.png/)?.[1];

  // overrides
  if (difficulty === "utage") {
    type = "utage";
  }

  const dxScorePair = (
    el.querySelector(".playlog_score_block")?.textContent?.trim() ?? ""
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
    console.warn("[parseNode] invalid dx score pair:", dxScorePair);
    return [] as const;
  }

  const subtitles = el.querySelectorAll(".sub_title .v_b");
  const trackString = subtitles[0].textContent ?? "";
  const track = parseInt(trackString.replace("TRACK", "").trim(), 10);

  const playedAtString = subtitles[1].textContent?.trim();
  const playedAt = playedAtString?.replace(
    /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/,
    "$1-$2-$3T$4:$5:00+09:00"
  );

  if (!songId || !type || !difficulty) {
    console.warn(
      "[parseNode] missing required fields:",
      songId,
      type,
      difficulty
    );
    return [] as const;
  }

  const flags: Flag[] = [];

  const flagImages = el.querySelectorAll(".playlog_result_innerblock img.f_l");
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
    const flag = (Object.keys(RECENT_RECORD_FLAG_MATCHERS) as Flag[]).find(
      (key) => src.includes(RECENT_RECORD_FLAG_MATCHERS[key])
    ) as Flag | undefined;
    if (flag) {
      flags.push(flag);
    }
  }

  return [
    {
      play: {
        track,
        timestamp: playedAt,
      },
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
    },
  ];
}
