var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/redirect.ts
import { domainToUnicode } from "node:url";
var ZONE_ASCII = "xn--6iq3kq43dxve.com";
var ZONE_UNICODE = "\u662F\u4EC0\u4E48\u6B4C.com";
var TARGET_ORIGIN = "https://dxrating.net";
var TARGET_LOCALE = "zh-Hans";
var TARGET_REF = "shenmegequ";
function targetUrl(query) {
  const params = [];
  if (query) params.push(["q", query]);
  params.push(["locale", TARGET_LOCALE], ["ref", TARGET_REF]);
  return `${TARGET_ORIGIN}/?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}
__name(targetUrl, "targetUrl");
var MAX_QUERY_LENGTH = 200;
function normalizeQuery(raw) {
  const query = [...raw.replace(/\s+/g, " ").trim()].slice(0, MAX_QUERY_LENGTH).join("").trim();
  return query === "" ? null : query;
}
__name(normalizeQuery, "normalizeQuery");
function queryFromPath(pathname) {
  const raw = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (raw === "") return null;
  try {
    return normalizeQuery(decodeURIComponent(raw));
  } catch {
    return null;
  }
}
__name(queryFromPath, "queryFromPath");
function queryFromHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(`.${ZONE_ASCII}`)) return null;
  const unicode = domainToUnicode(host);
  if (!unicode.endsWith(`.${ZONE_UNICODE}`)) return null;
  const labels = unicode.slice(0, -(ZONE_UNICODE.length + 1));
  if (labels.split(".").some((label) => label.startsWith("xn--"))) return null;
  if (labels === "www") return null;
  return normalizeQuery(labels.replace(/[.-]/g, " "));
}
__name(queryFromHost, "queryFromHost");
var NOT_ALIASES = /* @__PURE__ */ new Set([
  "/favicon.ico",
  "/robots.txt",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png"
]);
function handle(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return redirect(targetUrl(null));
  }
  if (NOT_ALIASES.has(url.pathname)) return new Response("Not Found", { status: 404 });
  const hasPath = url.pathname.replace(/\/+/g, "") !== "";
  const query = hasPath ? queryFromPath(url.pathname) : queryFromHost(hostOf(request, url));
  return redirect(targetUrl(query));
}
__name(handle, "handle");
function hostOf(request, url) {
  const header = request.headers.get("Host");
  return header ? header.replace(/:\d+$/, "") : url.hostname;
}
__name(hostOf, "hostOf");
function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "public, max-age=300" }
  });
}
__name(redirect, "redirect");

// src/index.ts
var index_default = {
  fetch(request) {
    return handle(request);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
