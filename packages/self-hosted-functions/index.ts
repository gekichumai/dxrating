import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import { handler } from "./fetch-net-records";
const app = new Koa();
const router = new Router();

const functionsPrefix = router.prefix("/functions");
functionsPrefix.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = {
      error: err instanceof Error ? err.message : "internal server error",
    };
  }
});

functionsPrefix.post("/fetch-net-records/v0", async (ctx) => {
  return handler(ctx);
});

app.use(bodyParser({ enableTypes: ["json"] }));
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(process.env.PORT ?? 3000);
