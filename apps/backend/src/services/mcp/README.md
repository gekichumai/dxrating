# MCP server (mcp.dxrating.net)

`/mcp` is the endpoint (`http.ts`, `server.ts`); `/`, `/index.md` and `/llms.txt` are the setup guide (`guide.ts`,
texts in `guide-text.ts`). Product analytics go to PostHog project 65078 (`analytics.ts`), errors and wide events to
Sentry (`telemetry.ts`).

## Attribution (`?via=`)

A link to the guide may carry `?via=<origin>`, the page that sent the visitor (e.g. `dxrating-home`). The guide keeps it
only when it matches `^[a-z0-9-]{1,40}$` (lowercased), else renders the plain guide. A kept origin is carried into
every endpoint URL the guide gives, joined to the guide's own tag with a dot:

| Where                                                     | `via` of the endpoint URL   | without an origin |
| --------------------------------------------------------- | --------------------------- | ----------------- |
| One-click link of `<app>` (Claude, Cursor, VS Code, ...)  | `<origin>.guide-<app>`      | `guide-<app>`     |
| Server URL card, agent prompt, per-client config snippets | `<origin>.guide`            | none              |

The endpoint stays `https://mcp.dxrating.net/mcp?via=...`; shell snippets quote it. `/mcp` keeps a `via` of
`[a-z0-9_.-]{1,80}` (else records `other`), so the origin is `splitByChar('.', via)[1]` when the via has a dot (a via without one, e.g. a link straight to `/mcp?via=x`, is its own origin).
The language links and the Markdown link of the guide keep the origin too.

Each view of the guide (GET of `/`, `/index.md`, `/llms.txt`; not prefetches or crawlers) sends `mcp_guide_viewed`
with `via` (the origin), `lang`, `format`, `country`, `ua_class`, `platform: "mcp"`, `deployment`, under the same
sampling, daily cap, daily distinct_id (no client name), no IP and no person profile as the endpoint's events.

## Funnel per origin (HogQL)

Guide view, then initialize, then a tool call, by origin. The distinct_id of a browser view and of an MCP client differ,
so the funnel is per origin, not per person:

```sql
WITH
  splitByChar('.', coalesce(properties.via, '')) AS parts,
  if(event = 'mcp_guide_viewed', coalesce(properties.via, '(none)'),
     if(length(parts) > 1, parts[1],
        if(parts[1] = '' OR startsWith(parts[1], 'guide'), '(none)', parts[1]))) AS origin
SELECT
  origin,
  countIf(event = 'mcp_guide_viewed') AS guide_views,
  uniqIf(distinct_id, event = 'mcp_initialize') AS clients_initialized,
  uniqIf(distinct_id, event = 'mcp_tool_called') AS clients_calling_tools,
  countIf(event = 'mcp_tool_called') AS tool_calls
FROM events
WHERE event IN ('mcp_guide_viewed', 'mcp_initialize', 'mcp_tool_called')
  AND properties.deployment = 'production'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY origin
ORDER BY guide_views DESC
```
