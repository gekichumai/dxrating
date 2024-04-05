import { ParameterizedContext } from "koa";
import { Session } from "./Session";
import { URLS } from "./URLS";
import { parseMusicRecordNode } from "./parseMusicRecordNode";
import { parseRecentRecordNode } from "./parseRecentRecordNode";
import { AchievementRecord } from "./record";

export type Flag =
  | "fullCombo"
  | "fullCombo+"
  | "allPerfect"
  | "allPerfect+"
  | "syncPlay"
  | "fullSync"
  | "fullSync+"
  | "fullSyncDX"
  | "fullSyncDX+";

export const NODE_ELEMENT_NODE = 1;

function musicRecordURLs(base: string): string[] {
  const difficulties = [0, 1, 2, 3, 4, 10];
  return difficulties.map(
    (difficulty) => `${base}?genre=99&diff=${difficulty}`
  );
}

interface AuthParams {
  id: string;
  password: string;
}

async function handleJP(
  ctx: ParameterizedContext,
  { id, password }: AuthParams
) {
  // auth
  const session = new Session();
  const loginPage = await session.fetchAsDOM(URLS.JP.LOGIN_PAGE);
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

  // fetch data
  // fetch recent records
  const recentRecordPage = await session.fetchAsDOM(URLS.JP.RECORD_RECENT_PAGE);
  if (!recentRecordPage) {
    throw new Error("internal server error: failed to parse record page");
  }
  const recentRecords = Array.from(
    recentRecordPage.querySelectorAll(".wrapper > div.p_10")
  ).flatMap(parseRecentRecordNode);
  // fetch music records
  const musicRecords: AchievementRecord[] = [];
  for (const url of musicRecordURLs(URLS.JP.RECORD_MUSICS_PAGE)) {
    const musicRecordsPage = await session.fetchAsDOM(url);
    if (!musicRecordsPage) {
      throw new Error(
        "internal server error: failed to parse music records page"
      );
    }
    musicRecords.push(
      ...Array.from(
        musicRecordsPage.querySelectorAll(".w_450.m_15.p_r.f_0")
      ).flatMap(parseMusicRecordNode)
    );
  }

  ctx.body = {
    recentRecords,
    musicRecords,
  };
}

async function handleINTL(
  ctx: ParameterizedContext,
  { id, password }: AuthParams
) {
  // auth
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

  // fetch data
  // fetch recent records
  const recentRecordsPage = await session.fetchAsDOM(
    URLS.INTL.RECORD_RECENT_PAGE
  );
  if (!recentRecordsPage) {
    throw new Error("internal server error: failed to parse record page");
  }
  const recentRecords = Array.from(
    recentRecordsPage.querySelectorAll(".wrapper > div.p_10")
  ).flatMap(parseRecentRecordNode);
  // fetch music records

  const musicRecords: AchievementRecord[] = [];
  for (const url of musicRecordURLs(URLS.INTL.RECORD_MUSICS_PAGE)) {
    const musicRecordsPage = await session.fetchAsDOM(url);
    if (!musicRecordsPage) {
      throw new Error(
        "internal server error: failed to parse music records page"
      );
    }
    musicRecords.push(
      ...Array.from(
        musicRecordsPage.querySelectorAll(".w_450.m_15.p_r.f_0")
      ).flatMap(parseMusicRecordNode)
    );
  }

  ctx.body = {
    recentRecords,
    musicRecords,
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
