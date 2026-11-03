# dxdata

The maimai DX song and chart data behind DXRating. The same data is also served at `https://miruku.dxrating.net/api/v1/dxdata`.

## Using the data

The data (`dxdata.json` and the `/api/v1/dxdata` catalog) is free to use, in tools, bots, sites, spreadsheets and commercial projects alike. Credit is appreciated; something like this is plenty:

> Data from DXRating (dxrating.net)

A link back to https://dxrating.net is welcome too. The short notice is in [LICENSE](LICENSE). The TypeScript helpers here are code, so they're MIT like the rest of the repo.

Song titles, jackets, charts and other game content belong to SEGA and their rights holders.

Song IDs (`dsng_…`) and sheet IDs (`dsht_…`) are stable and never reused. See the [API stability policy](https://dxrating.net/developers#api-stability) for what that covers.

> 简单说：数据可以随便用（包括商用），欢迎注明「Data from DXRating (dxrating.net)」。曲名、封面和谱面的权利属于 SEGA 及各权利方。

## Acknowledgements

- Data is based on the [zetaraku/arcade-songs](https://github.com/zetaraku/arcade-songs) project.
- Internal levels (定数), aliases and plenty of fixes come from the community. Thanks to everyone who measures and reports them, and to the alias feeds from LXNS, Yuzuchan and GCM bot.
