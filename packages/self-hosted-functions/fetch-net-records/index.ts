import { ParameterizedContext } from "koa";
import { DOMParser } from "xmldom-qsa";
import { Session } from "./Session";
import { URLS } from "./URLS";

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

function parseNode(record: Element) {
  if (record.nodeType !== Node.ELEMENT_NODE) return [] as const;
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

  // overrides
  if (difficulty === "utage") {
    type = "utage";
  }

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
    if (flagImage.nodeType !== Node.ELEMENT_NODE) return [] as const;
    const el = flagImage as Element;
    const src = el.attributes.getNamedItem("src")?.value;
    if (!src) {
      console.warn(
        "[parseNode] missing src attribute on flag image",
        el.innerHTML
      );
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
  id: string;
  password: string;
}

async function handleJP(
  ctx: ParameterizedContext,
  { id, password }: AuthParams
) {
  const session = new Session();
  const loginPageText = await (await session.fetch(URLS.JP.LOGIN_PAGE)).text();
  if (URLS.CHECKLIST.MAINTENANCE.some((m) => loginPageText.includes(m))) {
    throw new Error(
      "NET service is currently under maintenance. Please try again later."
    );
  }
  const loginPage = new DOMParser().parseFromString(loginPageText, "text/html");
  const loginPageToken = loginPage
    ?.querySelector('input[name="token"]')
    ?.attributes.getNamedItem("value")?.value;
  if (!loginPageToken) throw new Error("unable to fetch token");

  await session.fetch(URLS.JP.LOGIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      segaId: id,
      password: password,
      save_cookie: "on",
      token: loginPageToken,
    }),
  });
  await session.fetch(URLS.JP.LOGIN_AIMELIST);
  await session.fetch(URLS.JP.LOGIN_AIMELIST_SUBMIT);
  await session.fetch(URLS.JP.HOMEPAGE);
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

  ctx.body = {
    records: parsedRecords,
  };
}

async function handleINTL(
  ctx: ParameterizedContext,
  { id, password }: AuthParams
) {
  const session = new Session();
  await session.fetch(URLS.INTL.LOGIN_PAGE);

  const redirectURL = (
    await session.fetch(URLS.INTL.LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sid: id,
        password: password,
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
  if (URLS.CHECKLIST.MAINTENANCE.some((m) => recordPageText.includes(m))) {
    throw new Error(
      "NET service is currently under maintenance. Please try again later."
    );
  }
  const recordPage = new DOMParser().parseFromString(
    recordPageText,
    "text/html"
  );
  if (!recordPage) {
    throw new Error("internal server error: failed to parse record page");
  }
  const records = recordPage.querySelectorAll(".wrapper > div.p_10");
  const parsedRecords = Array.from(records).flatMap(parseNode);

  ctx.body = {
    records: parsedRecords,
  };
}

export async function handler(ctx: ParameterizedContext) {
  const { id, password, region } = (ctx.request.body as any) ?? {};
  if (!id || !password) {
    ctx.status = 400;
    ctx.body = {
      error:
        "`id` and `password` are required parameters but has not been provided",
    };
  }

  if (region === "intl") {
    await handleINTL(ctx, { id, password });
  } else if (region === "jp") {
    await handleJP(ctx, { id, password });
  } else {
    ctx.status = 400;
    ctx.body = {
      error: "unsupported region: `region` must be either `intl` or `jp`",
    };
  }
}
