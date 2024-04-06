import Koa from "koa";
import {
  MaimaiNETIntlClient,
  MaimaiNETJpClient,
  StateUpdateCallback,
} from "../../lib/client";

export async function v0Handler(ctx: Koa.Context) {
  const { region, authParams } = ctx.state;

  const client = {
    jp: new MaimaiNETJpClient(),
    intl: new MaimaiNETIntlClient(),
  }[region as "jp" | "intl"];

  await client.login(authParams);

  const recent = await client.fetchRecentRecords();
  const music = await client.fetchMusicRecords();

  ctx.body = { recent, music };
}

export async function v1Handler(ctx: Koa.Context) {
  const { region, authParams } = ctx.state;

  const onProgress: StateUpdateCallback = (state) => {
    ctx.sse?.send({ event: "progress", data: { state } });
  };

  const client = {
    jp: new MaimaiNETJpClient(onProgress),
    intl: new MaimaiNETIntlClient(onProgress),
  }[region as "jp" | "intl"];

  await client.login(authParams);

  const recent = await client.fetchRecentRecords();
  const music = await client.fetchMusicRecords();

  ctx.sse?.send({ event: "data", data: { recent, music } });
  ctx.sse?.end();
}
