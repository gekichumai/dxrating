// src/index.ts
import { serve } from "@hono/node-server";

// src/app.ts
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIGenerator } from "@orpc/openapi";
import { RequestHeadersHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { Effect as Effect3 } from "effect";
import { Hono } from "hono";

// src/contract.ts
import { oc as contractBuilder } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { z } from "zod";
var oc = contractBuilder.errors({});
var PrincipalSchema = z.object({
  type: z.enum(["human", "agent"]),
  id: z.string(),
  /** `type:id`, the form written to `created_by` / `updated_by` and the audit log */
  actor: z.string(),
  scopes: z.array(z.string())
});
var adminApiContract = {
  me: oc.meta(openapi({ method: "GET", path: "/me", summary: "The calling principal", tags: ["admin"] })).output(PrincipalSchema)
};

// src/require-admin.ts
import { ORPCError } from "@orpc/server";
import { Effect as Effect2 } from "effect";

// src/access.ts
import { Context as Context2, Data, Effect, Layer as Layer2 } from "effect";
import { createRemoteJWKSet, jwtVerify } from "jose";

// src/config.ts
import { Context, Layer } from "effect";
import { z as z2 } from "zod";
var list = z2.string().optional().transform(
  (value) => (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0)
);
var envSchema = z2.object({
  NODE_ENV: z2.enum(["development", "production", "test"]).default("development"),
  PORT: z2.coerce.number().int().default(3100),
  /** The admin host's own origin; a browser request from any other origin is refused */
  ADMIN_ORIGIN: z2.string().url().default("http://localhost:5180"),
  /** Cloudflare Access team domain, e.g. `example.cloudflareaccess.com` */
  ADMIN_ACCESS_TEAM_DOMAIN: z2.string().optional(),
  /** The Access application's AUD tag */
  ADMIN_ACCESS_AUD: z2.string().optional(),
  /** Emails allowed in, repeating the Access policy inside the app. Empty means nobody. */
  ADMIN_HUMAN_EMAILS: list,
  /** Development only: treat every request as this Access identity. Refused outside development. */
  ADMIN_DEV_ACCESS_EMAIL: z2.string().email().optional()
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "development" && env.ADMIN_DEV_ACCESS_EMAIL) {
    ctx.addIssue({ code: "custom", message: "ADMIN_DEV_ACCESS_EMAIL is allowed in development only" });
  }
  if (env.NODE_ENV === "production" && (!env.ADMIN_ACCESS_TEAM_DOMAIN || !env.ADMIN_ACCESS_AUD)) {
    ctx.addIssue({ code: "custom", message: "ADMIN_ACCESS_TEAM_DOMAIN and ADMIN_ACCESS_AUD are required" });
  }
});
var AdminApiConfigService = class extends Context.Service()(
  "dxrating-admin/Config"
) {
};
var adminApiConfigLayer = (config2) => Layer.succeed(AdminApiConfigService, config2);

// src/access.ts
var AccessDenied = class extends Data.TaggedError("AccessDenied") {
};
var AccessVerifier = class extends Context2.Service()("dxrating-admin/AccessVerifier") {
};
var AccessVerifierLive = Layer2.effect(
  AccessVerifier,
  Effect.gen(function* () {
    const config2 = yield* AdminApiConfigService;
    if (config2.ADMIN_DEV_ACCESS_EMAIL) {
      const email = config2.ADMIN_DEV_ACCESS_EMAIL.toLowerCase();
      return { verify: () => Effect.succeed({ kind: "user", email }) };
    }
    const team = config2.ADMIN_ACCESS_TEAM_DOMAIN;
    const audience = config2.ADMIN_ACCESS_AUD;
    if (!team || !audience) {
      return { verify: () => Effect.fail(new AccessDenied({ reason: "Access is not configured" })) };
    }
    const issuer = `https://${team}`;
    return {
      verify: verifyAccessAssertion(createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)), issuer, audience)
    };
  })
);
var verifyAccessAssertion = (keys, issuer, audience) => (assertion) => assertion ? Effect.tryPromise({
  try: () => jwtVerify(assertion, keys, { issuer, audience, algorithms: ["RS256"] }),
  catch: (cause) => new AccessDenied({ reason: "Invalid Access assertion", cause })
}).pipe(Effect.flatMap(({ payload }) => identityFromClaims(payload))) : Effect.fail(new AccessDenied({ reason: "Missing Access assertion" }));
var identityFromClaims = (claims) => {
  if (typeof claims.email === "string" && claims.email.length > 0) {
    return Effect.succeed({ kind: "user", email: claims.email.toLowerCase() });
  }
  if (typeof claims.common_name === "string" && claims.common_name.length > 0) {
    return Effect.succeed({ kind: "service", commonName: claims.common_name });
  }
  return Effect.fail(new AccessDenied({ reason: "Access assertion names no identity" }));
};

// src/require-admin.ts
var ALL_SCOPES = "*";
var unauthorized = () => new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
var forbidden = (message = "Forbidden") => new ORPCError("FORBIDDEN", { message });
var requireAdmin = (headers) => Effect2.gen(function* () {
  const config2 = yield* AdminApiConfigService;
  const origin = headers.get("origin");
  if (origin !== null && origin !== new URL(config2.ADMIN_ORIGIN).origin) return yield* Effect2.fail(forbidden());
  const verifier = yield* AccessVerifier;
  const identity = yield* verifier.verify(headers.get("cf-access-jwt-assertion")).pipe(Effect2.mapError(() => unauthorized()));
  if (identity.kind === "service") return yield* Effect2.fail(forbidden("Agent tokens are not enabled yet"));
  if (!config2.ADMIN_HUMAN_EMAILS.includes(identity.email)) return yield* Effect2.fail(forbidden());
  return { type: "human", id: identity.email, actor: `human:${identity.email}`, scopes: [ALL_SCOPES] };
});

// src/router.ts
import { implement } from "@orpc/server";
import { handlerGen } from "@orpc/experimental-effect";
var os = implement(adminApiContract).$context();
var adminApiRouter = os.router({
  me: os.me.handler(
    handlerGen(function* ({ context }) {
      const principal = yield* requireAdmin(context.reqHeaders ?? new Headers());
      return { ...principal, scopes: [...principal.scopes] };
    })
  )
});

// src/app.ts
var NO_STORE = { "Cache-Control": "private, no-store" };
var createAdminApiApp = (runtime2) => {
  const handler = new OpenAPIHandler(adminApiRouter, {
    plugins: [new RequestHeadersHandlerPlugin()]
  });
  const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] });
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/spec.json", async (c) => {
    const allowed = await runtime2.runPromise(
      requireAdmin(c.req.raw.headers).pipe(
        Effect3.as(true),
        Effect3.catch(() => Effect3.succeed(false))
      )
    );
    if (!allowed) return c.json({ message: "Forbidden" }, 403, NO_STORE);
    const spec = await generator.generate(adminApiContract, {
      base: { info: { title: "DXRating Admin API", version: "0.1.0" }, servers: [{ url: "/api" }] }
    });
    return c.json(spec, 200, NO_STORE);
  });
  app.all("/api/*", async (c) => {
    const effectContext = await runtime2.runPromise(runtime2.contextEffect);
    const { response } = await handler.handle(c.req.raw, {
      prefix: "/api",
      context: { "effect/context": effectContext }
    });
    if (!response) return c.notFound();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { status: response.status, headers });
  });
  return app;
};

// src/runtime.ts
import { Layer as Layer3, ManagedRuntime } from "effect";
var adminApiLayer = (config2) => {
  const configLayer = adminApiConfigLayer(config2);
  return Layer3.merge(configLayer, AccessVerifierLive.pipe(Layer3.provide(configLayer)));
};
var makeAdminApiRuntime = (layer) => ManagedRuntime.make(layer);

// src/index.ts
var config = envSchema.parse(process.env);
var runtime = makeAdminApiRuntime(adminApiLayer(config));
var server = serve(
  { fetch: createAdminApiApp(runtime).fetch, port: config.PORT },
  (info) => console.log(`admin-api listening on ${info.port}`)
);
var shutdown = () => server.close(() => void runtime.dispose().then(() => process.exit(0)));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
//# sourceMappingURL=index.js.map
