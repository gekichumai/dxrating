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

## Events

One PostHog event per JSON-RPC message (`analytics.ts`): `mcp_initialize`, `mcp_server_discover`, `mcp_tools_list`,
`mcp_tool_called`, each with `protocol_version` (from `initialize`, else the MCP-Protocol-Version header).

How a client opens depends on its protocol era:

- 2025-era clients send `initialize`, then their calls. Only `initialize` names the client, so the daily distinct_id of
  the initialize (which hashes the client name) differs from that of the calls after it.
- 2026-07-28 clients have no `initialize`. They may probe with `server/discover` (`mcp_server_discover`), which is
  optional, or go straight to `tools/list` or `tools/call`. A request may name the client in `_meta` (`clientInfo` is
  optional in the spec); clients that send it on every request, as the SDKs do, keep one distinct_id for all their
  events, while a client that sends it on some requests only gets one id with it and one without.

So a client is **connected** on its `mcp_initialize` or `mcp_server_discover`, or on any event whose `protocol_version`
is 2026-07-28 or later. Don't count `mcp_initialize` alone: it misses every 2026-07-28 client. The counts are
approximate daily pseudonymous ones: a client that names itself inconsistently counts more than once, and clients behind
one address prefix and User-Agent that send no name count once.

## Funnel per origin (HogQL)

Guide view, then a connected client, then a tool call, by origin. The distinct_id of a browser view and of an MCP client
differ, so the funnel is per origin, not per person:

```sql
SELECT
  origin,
  countIf(event = 'mcp_guide_viewed') AS guide_views,
  uniqIf(distinct_id, connected) AS clients_connected,
  uniqIf(distinct_id, connected AND modern) AS clients_connected_2026,
  uniqIf(distinct_id, event = 'mcp_tool_called') AS clients_calling_tools,
  countIf(event = 'mcp_tool_called') AS tool_calls
FROM (
  SELECT
    event,
    distinct_id,
    coalesce(properties.via, '') AS via,
    splitByChar('.', via) AS parts,
    if(event = 'mcp_guide_viewed', if(via = '', '(none)', via),
       if(length(parts) > 1, parts[1],
          if(via = '' OR startsWith(via, 'guide'), '(none)', via))) AS origin,
    -- 2026-07-28 and later: no initialize; any request opens a client (approximate, see above)
    coalesce(properties.protocol_version, '') >= '2026' AS modern,
    event IN ('mcp_initialize', 'mcp_server_discover')
      OR (modern AND event IN ('mcp_tools_list', 'mcp_tool_called')) AS connected
  FROM events
  WHERE event IN ('mcp_guide_viewed', 'mcp_initialize', 'mcp_server_discover', 'mcp_tools_list', 'mcp_tool_called')
    AND properties.deployment = 'production'
    AND timestamp > now() - INTERVAL 30 DAY
)
GROUP BY origin
ORDER BY guide_views DESC, clients_connected DESC
```
