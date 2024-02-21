import {
  Cookie,
  getSetCookies,
} from "https://deno.land/std@0.216.0/http/cookie.ts";
import { URLS } from "./URLS.ts";

const COMMON_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "ja;q=0.9,en;q=0.8",
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
  #client = Deno.createHttpClient({
    caCerts: [
      `Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            01:ee:5f:22:1d:fc:62:3b:d4:33:3a:85:57
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: OU = GlobalSign Root CA - R3, O = GlobalSign, CN = GlobalSign
        Validity
            Not Before: Nov 21 00:00:00 2018 GMT
            Not After : Nov 21 00:00:00 2028 GMT
        Subject: C = BE, O = GlobalSign nv-sa, CN = GlobalSign RSA OV SSL CA 2018
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                RSA Public-Key: (2048 bit)
                Modulus:
                    00:a7:5a:c9:d5:0c:18:21:00:23:d5:97:0f:eb:ae:
                    dd:5c:68:6b:6b:8f:50:60:13:7a:81:cb:97:ee:8e:
                    8a:61:94:4b:26:79:f6:04:a7:2a:fb:a4:da:56:bb:
                    ee:a0:a4:f0:7b:8a:7f:55:1f:47:93:61:0d:6e:71:
                    51:3a:25:24:08:2f:8c:e1:f7:89:d6:92:cf:af:b3:
                    a7:3f:30:ed:b5:df:21:ae:fe:f5:44:17:fd:d8:63:
                    d9:2f:d3:81:5a:6b:5f:d3:47:b0:ac:f2:ab:3b:24:
                    79:4f:1f:c7:2e:ea:b9:15:3a:7c:18:4c:69:b3:b5:
                    20:59:09:5e:29:c3:63:e6:2e:46:5b:aa:94:90:49:
                    0e:b9:f0:f5:4a:a1:09:2f:7c:34:4d:d0:bc:00:c5:
                    06:55:79:06:ce:a2:d0:10:f1:48:43:e8:b9:5a:b5:
                    95:55:bd:31:d2:1b:3d:86:be:a1:ec:0d:12:db:2c:
                    99:24:ad:47:c2:6f:03:e6:7a:70:b5:70:cc:cd:27:
                    2c:a5:8c:8e:c2:18:3c:92:c9:2e:73:6f:06:10:56:
                    93:40:aa:a3:c5:52:fb:e5:c5:05:d6:69:68:5c:06:
                    b9:ee:51:89:e1:8a:0e:41:4d:9b:92:90:0a:89:e9:
                    16:6b:ef:ef:75:be:7a:46:b8:e3:47:8a:1d:1c:2e:
                    a7:4f
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Key Usage: critical
                Digital Signature, Certificate Sign, CRL Sign
            X509v3 Basic Constraints: critical
                CA:TRUE, pathlen:0
            X509v3 Subject Key Identifier: 
                F8:EF:7F:F2:CD:78:67:A8:DE:6F:8F:24:8D:88:F1:87:03:02:B3:EB
            X509v3 Authority Key Identifier: 
                keyid:8F:F0:4B:7F:A8:2E:45:24:AE:4D:50:FA:63:9A:8B:DE:E2:DD:1B:BC

            Authority Information Access: 
                OCSP - URI:http://ocsp2.globalsign.com/rootr3

            X509v3 CRL Distribution Points: 

                Full Name:
                  URI:http://crl.globalsign.com/root-r3.crl

            X509v3 Certificate Policies: 
                Policy: X509v3 Any Policy
                  CPS: https://www.globalsign.com/repository/

    Signature Algorithm: sha256WithRSAEncryption
         99:90:c8:2d:5f:42:8a:d4:0b:66:db:98:03:73:11:d4:88:86:
         52:28:53:8a:fb:ad:df:fd:73:8e:3a:67:04:db:c3:53:14:70:
         14:09:7c:c3:e0:f8:d7:1c:98:1a:a2:c4:3e:db:e9:00:e3:ca:
         70:b2:f1:22:30:21:56:db:d3:ad:79:5e:81:58:0b:6d:14:80:
         35:f5:6f:5d:1d:eb:9a:47:05:ff:59:8d:00:b1:40:da:90:98:
         96:1a:ba:6c:6d:7f:8c:f5:b3:80:df:8c:64:73:36:96:79:79:
         69:74:ea:bf:f8:9e:01:8f:a0:95:69:8d:e9:84:ba:e9:e5:d4:
         88:38:db:78:3b:98:d0:36:7b:29:b0:d2:52:18:90:de:52:43:
         00:ae:6a:27:c8:14:9e:86:95:ac:e1:80:31:30:7e:9a:25:bb:
         8b:ac:04:23:a6:99:00:e8:f1:d2:26:ec:0f:7e:3b:8a:2b:92:
         38:13:1d:8f:86:cd:86:52:47:e6:34:7c:5b:a4:02:3e:8a:61:
         7c:22:76:53:5a:94:53:33:86:b8:92:a8:72:af:a1:f9:52:87:
         1f:31:a5:fc:b0:81:57:2f:cd:f4:ce:dc:f6:24:cf:a7:e2:34:
         90:68:9d:fe:aa:f1:a9:9a:12:cc:9b:c0:c6:c3:a8:a5:b0:21:
         7e:de:48:f6
-----BEGIN CERTIFICATE-----
MIIETjCCAzagAwIBAgINAe5fIh38YjvUMzqFVzANBgkqhkiG9w0BAQsFADBMMSAw
HgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xvYmFs
U2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0xODExMjEwMDAwMDBaFw0yODEx
MjEwMDAwMDBaMFAxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52
LXNhMSYwJAYDVQQDEx1HbG9iYWxTaWduIFJTQSBPViBTU0wgQ0EgMjAxODCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKdaydUMGCEAI9WXD+uu3Vxoa2uP
UGATeoHLl+6OimGUSyZ59gSnKvuk2la77qCk8HuKf1UfR5NhDW5xUTolJAgvjOH3
idaSz6+zpz8w7bXfIa7+9UQX/dhj2S/TgVprX9NHsKzyqzskeU8fxy7quRU6fBhM
abO1IFkJXinDY+YuRluqlJBJDrnw9UqhCS98NE3QvADFBlV5Bs6i0BDxSEPouVq1
lVW9MdIbPYa+oewNEtssmSStR8JvA+Z6cLVwzM0nLKWMjsIYPJLJLnNvBhBWk0Cq
o8VS++XFBdZpaFwGue5RieGKDkFNm5KQConpFmvv73W+eka440eKHRwup08CAwEA
AaOCASkwggElMA4GA1UdDwEB/wQEAwIBhjASBgNVHRMBAf8ECDAGAQH/AgEAMB0G
A1UdDgQWBBT473/yzXhnqN5vjySNiPGHAwKz6zAfBgNVHSMEGDAWgBSP8Et/qC5F
JK5NUPpjmove4t0bvDA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHA6
Ly9vY3NwMi5nbG9iYWxzaWduLmNvbS9yb290cjMwNgYDVR0fBC8wLTAroCmgJ4Yl
aHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDBHBgNVHSAEQDA+
MDwGBFUdIAAwNDAyBggrBgEFBQcCARYmaHR0cHM6Ly93d3cuZ2xvYmFsc2lnbi5j
b20vcmVwb3NpdG9yeS8wDQYJKoZIhvcNAQELBQADggEBAJmQyC1fQorUC2bbmANz
EdSIhlIoU4r7rd/9c446ZwTbw1MUcBQJfMPg+NccmBqixD7b6QDjynCy8SIwIVbb
0615XoFYC20UgDX1b10d65pHBf9ZjQCxQNqQmJYaumxtf4z1s4DfjGRzNpZ5eWl0
6r/4ngGPoJVpjemEuunl1Ig423g7mNA2eymw0lIYkN5SQwCuaifIFJ6GlazhgDEw
fpolu4usBCOmmQDo8dIm7A9+O4orkjgTHY+GzYZSR+Y0fFukAj6KYXwidlNalFMz
hriSqHKvoflShx8xpfywgVcvzfTO3PYkz6fiNJBonf6q8amaEsybwMbDqKWwIX7e
SPY=
-----END CERTIFICATE-----`,
    ],
  });

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

    const res = await fetch(url, {
      redirect: "manual",
      ...init,
      headers,
      client: this.#client,
    });
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
