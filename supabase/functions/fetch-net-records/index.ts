import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  DOMParser,
  Element,
  Node,
  NodeType,
} from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { Session } from "./Session.ts";
import { URLS } from "./URLS.ts";

type Flag =
  | "fullCombo"
  | "fullCombo+"
  | "allPerfect"
  | "allPerfect+"
  | "syncPlay"
  | "fullSync"
  | "fullSync+"
  | "fullSyncDX"
  | "fullSyncDX+";

const flagMatchers: Record<Flag, string> = {
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

function parseNode(record: Node) {
  if (record.nodeType !== NodeType.ELEMENT_NODE) return [] as const;
  const el = record as Element;

  const songId = el.querySelector(".basic_block.break")?.textContent.trim();
  const achievementRateString = el
    .querySelector(".playlog_achievement_txt")
    ?.textContent.trim();

  const achievementRate = parseInt(
    achievementRateString?.replace("%", "").replace(".", "") ?? ""
  );

  const typeIcon = el
    .querySelector(".playlog_music_kind_icon")
    ?.attributes.getNamedItem("src");
  // match music_("std"|"dx").png
  const type = typeIcon?.value.match(/music_(std|dx)\.png/)?.[1];

  const difficultyIcon = el
    .querySelector(".playlog_diff")
    ?.attributes.getNamedItem("src");
  const difficulty = difficultyIcon?.value.match(/diff_(.*)\.png/)?.[1];

  const dxScorePair = (
    el.querySelector(".playlog_score_block")?.textContent.trim() ?? ""
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
    return [] as const;
  }

  const subtitles = el.querySelectorAll(".sub_title .v_b");
  const trackString = subtitles[0].textContent;
  const track = parseInt(trackString.replace("TRACK", "").trim(), 10);

  const playedAtString = subtitles[1].textContent.trim();
  const playedAt = playedAtString.replace(
    /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/,
    "$1-$2-$3T$4:$5:00+09:00"
  );

  if (!songId || !type || !difficulty || !achievementRate) {
    return [] as const;
  }

  const flags: Flag[] = [];

  const flagImages = el.querySelectorAll(".playlog_result_innerblock img.f_l");
  for (const flagImage of flagImages) {
    if (flagImage.nodeType !== NodeType.ELEMENT_NODE) return [] as const;
    const el = flagImage as Element;
    const src = el.attributes.getNamedItem("src")?.value;
    if (!src) {
      continue;
    }
    const flag = (Object.keys(flagMatchers) as Flag[]).find((key) =>
      src.includes(flagMatchers[key])
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

interface AuthParams {
  segaID: string;
  segaIDPassword: string;
}

async function handleJP({ segaID, segaIDPassword }: AuthParams) {
  const session = new Session();
  const loginPageText = await (await session.fetch(URLS.JP.LOGIN_PAGE)).text();
  const loginPage = new DOMParser().parseFromString(loginPageText, "text/html");
  const loginPageToken = loginPage
    ?.querySelector('input[name="token"]')
    ?.attributes.getNamedItem("value")?.value;
  if (!loginPageToken) throw new Error("unable to fetch token");

  await session.fetch(URLS.INTL.LOGIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      sid: segaID,
      password: segaIDPassword,
      retention: "1",
      token: loginPageToken,
    }),
  });
  await session.fetch(URLS.JP.LOGIN_AIMELIST);
  const recordPageResponse = await session.fetch(URLS.JP.RECORD_PAGE);
  const recordPageText = await recordPageResponse.text();
  const recordPage = new DOMParser().parseFromString(
    recordPageText,
    "text/html"
  );
  if (!recordPage) {
    throw new Error("internal server error: failed to parse record page");
  }
  const records = recordPage.querySelectorAll(".wrapper > div.p_10");
  const parsedRecords = Array.from(records).flatMap(parseNode);

  return {
    records: parsedRecords,
  };
}

async function handleINTL({ segaID, segaIDPassword }: AuthParams) {
  const session = new Session();
  await session.fetch(URLS.INTL.LOGIN_PAGE);
  const redirectURL = (
    await session.fetch(URLS.INTL.LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sid: segaID,
        password: segaIDPassword,
        retention: "1",
      }),
    })
  ).headers.get("location");
  if (!redirectURL) {
    throw new Error("invalid credentials: empty redirectURL");
  }
  await session.fetch(redirectURL);
  const recordPageResponse = await session.fetch(URLS.INTL.RECORD_PAGE);
  const recordPageText = await recordPageResponse.text();
  const recordPage = new DOMParser().parseFromString(
    recordPageText,
    "text/html"
  );
  if (!recordPage) {
    throw new Error("internal server error: failed to parse record page");
  }
  const records = recordPage.querySelectorAll(".wrapper > div.p_10");
  const parsedRecords = Array.from(records).flatMap(parseNode);

  return {
    records: parsedRecords,
  };
}

async function handle(req: Request) {
  const { segaID, segaIDPassword, region } = await req.json();
  if (!segaID || !segaIDPassword) {
    throw new Error(
      "segaID and segaIDPassword are required parameters but has not been provided."
    );
  }

  if (region === "intl") {
    return await handleINTL({ segaID, segaIDPassword });
  } else if (region === "jp") {
    return await handleJP({ segaID, segaIDPassword });
  } else {
    throw new Error("unsupported region");
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  try {
    const data = await handle(req);
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    let message = "An unknown error occurred";
    if (e instanceof Error) {
      message = e.message;
    }
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
