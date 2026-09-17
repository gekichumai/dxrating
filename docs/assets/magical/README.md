# MAGiCAL artwork

Japan uses MAGiCAL (September 17, 2026); International uses CiRCLE PLUS.

Official Sega resources, downloaded September 17, 2026:

- [Launch announcement](https://info-maimai.sega.jp/9568/)
- [Transparent logo](https://info-maimai.sega.jp/wp-content/uploads/2026/09/e7a336f49766d1172227b6056411ea8d-scaled-e1785310221781.png) — `logo.png`
- [Kanadera character artwork](https://info-maimai.sega.jp/wp-content/uploads/2026/09/37ffc2825522019c96d3032382d9016d-scaled-e1788836850707.png) — `kanadera.png`

The Sega homepage still displayed CiRCLE PLUS when these resources were retrieved. The launch announcement supplies the MAGiCAL identity and release date. Sega retains ownership of the official artwork.

## Background

[Editable Figma composition](https://www.figma.com/design/tFHSd2n2FsPw3rLgNT0ljC/Personal-Draft?node-id=6747-1412), on the existing DXRating page. `background.svg` contains named layers and an embedded copy of the official character artwork. It follows the previous backgrounds' decorative edges and open center, with mint, turquoise, and gold, clock dials, star constellations, sweeping musical trails, gears, spell pages, and a magic wand. The September 17 promotional references inform the blue-and-gold palace, turquoise lagoon, garden islands, cloud banks, and sparkling water. The final revision follows the user-selected Frame 2 (1626:81): a stronger turquoise field, continuous diamond grid, diagonal star trails and outlined wands, plus large central musical and magic-hat emblems. Earlier compositions remain beside it in Figma. A small clipping path removes the visible copyright text from the background export.

The web exports are checked into `apps/web/public/images/versions/magical/` so they deploy with the app. They do not depend on a separate CDN upload. The background is 1600 × 1920 WebP; the logo is a lossless WebP conversion of Sega's transparent PNG.

This update changes the selected release and artwork. It does not regenerate `packages/dxdata/dxdata.json` or invent MAGiCAL chart constants. The existing catalog continues to provide its known values until the upstream data is regenerated. Rank badges reuse the existing CiRCLE PLUS artwork until MAGiCAL rank assets are available.

The central emblem pair is optically centered using the alpha-weighted centroid of its rendered strokes: (1000, 1200) on the 2000 × 2400 canvas. The group is translated by (62.49, 99.55) from the original placement, matching Figma.
