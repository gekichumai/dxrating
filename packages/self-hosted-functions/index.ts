import cors from "@koa/cors";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import { handler } from "./fetch-net-records";
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

router.post("/functions/fetch-net-records/v0", handler);

app.use(cors());
app.use(bodyParser({ enableTypes: ["json"] }));
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(process.env.PORT ?? 3000);
