# 是什么歌.com

The Worker behind 是什么歌.com (`xn--6iq3kq43dxve.com`). It turns an alias into a dxrating.net search, in Chinese:

| Request | Redirect (302, cached 5 minutes) |
| --- | --- |
| `https://一号店.是什么歌.com` | `https://dxrating.net/?q=一号店&locale=zh-Hans&ref=shenmegequ` |
| `https://是什么歌.com/Big%20Daddy` | `…/?q=Big Daddy&…` (the path wins over the subdomain and keeps case and spaces) |
| `https://big-daddy.是什么歌.com` | `…/?q=big daddy&…` (`-` becomes a space again) |
| `https://是什么歌.com/`, `www.`, anything undecodable | `https://dxrating.net/?locale=zh-Hans&ref=shenmegequ` |

The target URL is built in one place, `targetUrl` in `src/redirect.ts`.

The certificate covers the apex and one level of subdomain (`*.xn--6iq3kq43dxve.com`), so `a.b.是什么歌.com` fails the
TLS handshake over HTTPS; over plain HTTP the Worker joins the labels with spaces. Web and iOS never build such hosts:
they turn dots into `-`.

```bash
pnpm --filter @gekichumai/shenmegequ test
pnpm --filter @gekichumai/shenmegequ build   # type-check + wrangler dry run
```

Deployed by `.github/workflows/shenmegequ.yml` on pushes to `main`. The deploy checks a live subdomain redirect and
runs `wrangler rollback` if it does not match.
