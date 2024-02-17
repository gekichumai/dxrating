import {
  Cookie,
  getSetCookies,
} from "https://deno.land/std@0.216.0/http/cookie.ts";
import { URLS } from "./URLS.ts";

const COMMON_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8,zh;q=0.7",
  DNT: "1",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Chromium";v="121", "Not A(Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

export class Session {
  #cookies = new Map<string, Cookie[]>();

  setCookie(hostname: string, headers: Headers) {
    const existingCookies = this.#cookies.get(hostname) ?? [];

    for (const cookie of getSetCookies(headers)) {
      const exist = existingCookies.findIndex((e) => e.name === cookie.name);
      if (exist >= 0) {
        existingCookies.splice(exist, 1);
      }
      existingCookies.push(cookie);
    }

    this.#cookies.set(hostname, existingCookies);
  }

  getCookies(hostname: string) {
    return this.#cookies.get(hostname) ?? [];
  }

  clearCookies(hostname: string) {
    this.#cookies.delete(hostname);
  }

  async fetch(url: string, init?: RequestInit) {
    const requestURL = new URL(url);
    const cookies = this.getCookies(requestURL.hostname);
    const initHeaders = {
      ...init?.headers,
      Referer: `${requestURL.protocol}//${requestURL.hostname}`,
      ...COMMON_HEADERS,
    };
    const headers = new Headers(initHeaders);
    headers.set(
      "Cookie",
      cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    );
    const mergedInit = { redirect: "manual" as const, ...init, headers };

    const res = await fetch(url, mergedInit);
    this.setCookie(requestURL.hostname, res.headers);

    if (
      res.status === 302 &&
      URLS.CHECKLIST.ERROR.includes(res.headers.get("location") ?? "")
    ) {
      throw new Error(
        "unknown error occurred: response redirects to error page"
      );
    }

    return res;
  }
}
