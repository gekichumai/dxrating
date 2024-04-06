import cors from "@koa/cors";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaSSE from "koa-event-stream";
import Router from "koa-router";
import { v0Handler, v1Handler } from "./functions/fetch-net-records";
import { AuthParams } from "./lib/client";
const app = new Koa();
const router = new Router();

router.use(async (ctx, next) => {
  try {
    return await next();
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = {
      error: err instanceof Error ? err.message : "internal server error",
    };
  }
});

router.get("/", async (ctx) => {
  ctx.body = {
    message: "みるく is up and running! 🥛",
    _self:
      "https://github.com/gekichumai/dxrating/tree/main/packages/self-hosted-functions",
  };
});

const verifyParams: Koa.Middleware = async (ctx, next) => {
  const region = ctx.params.region ?? (ctx.request.body as any)?.region;
  const { id, password } = (ctx.request.body as any) ?? {};
  if (!id || !password) {
    throw new Error(
      "`id` and `password` are required parameters but has not been provided"
    );
  }

  const authParams = { id, password } as AuthParams;

  if (region !== "jp" && region !== "intl") {
    throw new Error(
      "unsupported region: `region` must be either `intl` or `jp`"
    );
  }

  ctx.state.authParams = authParams;
  ctx.state.region = region;
  await next();
};

router.post("/functions/fetch-net-records/v0", verifyParams, v0Handler);
router.post(
  "/functions/fetch-net-records/v1/:region",
  KoaSSE(),
  async (ctx: Koa.Context, next) => {
    try {
      await next();
    } catch (err) {
      ctx.sse?.send({
        event: "error",
        data: {
          error: err instanceof Error ? err.message : "internal server error",
        },
      });
      ctx.sse?.end();
    }
  },
  verifyParams,
  v1Handler
);

app.use(cors());
app.use(bodyParser({ enableTypes: ["json"] }));
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(process.env.PORT ?? 3000);
