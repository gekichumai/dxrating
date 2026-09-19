# MAGiCAL artwork

Japan uses MAGiCAL (September 17, 2026); International uses CiRCLE PLUS.

## Official references

- [Live MAGiCAL site](https://maimai.sega.jp/), inspected September 17, 2026. Its new scenery establishes turquoise water, floating gardens, pale columns, coral-roofed castles, rainbows, and looping musical staffs. Some hero/logo images still served CiRCLE PLUS artwork during inspection, including with browser caching disabled; the redesign follows the new scenery, not those stale identity assets.
- Official scenery resource family: `https://maimai.sega.jp/assets/maiDecorationBg/` (`sea.png`, `island_01.png`, `island_02.png`, `staff_01.png`–`staff_03.png`, `note_01.png`, `note_02.png`, `croud_01.png`–`croud_03.png`). These were inspected as references; the shipped scenery is original vector artwork, not those raster backgrounds.
- [Launch announcement](https://info-maimai.sega.jp/9568/), [logo source](https://info-maimai.sega.jp/wp-content/uploads/2026/09/e7a336f49766d1172227b6056411ea8d-scaled-e1785310221781.png), and [Kanadera source](https://info-maimai.sega.jp/wp-content/uploads/2026/09/37ffc2825522019c96d3032382d9016d-scaled-e1788836850707.png). Sega retains ownership of the official logo and character artwork.

## Current vector scene

`kingdom.svg` is the editable standalone composition. The [editable Figma frame](https://www.figma.com/design/tFHSd2n2FsPw3rLgNT0ljC/Personal-Draft?node-id=6748-3454) sits beside the previous designs on the dxrating page. `kingdom-figma.svg` is its import-compatible copy: reusable symbols are expanded, inherited rune colors are explicit, and the diamond pattern is represented by clipped vector paths. This larger design-only export is not shipped to the web app. It replaces the clockwork-heavy design with floating garden islands and waterfalls, pale garden pillars, a coral-and-ivory palace, astronomical rings, rainbow musical staffs, water ripples, tiny constellation fragments, and a centered magic-hat seal. The diamond field preserves the previous Frame 2's patterned center while the quieter foreground leaves chart values readable.

Run `python3 scripts/export-magical-background.py` to regenerate `apps/web/src/assets/magical-background.svg`. The exporter removes standalone ornaments' placement transforms so the responsive React renderer can anchor them independently. The exported file is 37,798 bytes (about 5 KB gzip), with 153 internal symbol references. All vectors use one shared SVG download; they do not create a request per layer or fragment. The existing official character remains a separate 62,996-byte WebP. No new raster assets or animation libraries are added.

`MagicalBackground.tsx` renders 14 independently anchored views into this asset. Vite fingerprints the same-origin SVG and character WebP. The optical alpha centroid of the new seal was measured at (1005.607, 1223.651); translating by (-5.61, -23.65) centers it at (1000, 1200), matching the `400 870 1200 660` viewBox. Edge views clip their contents to prevent the opposite edge's decorations from leaking across the scene.

At 1100px and 600px, peripheral artwork moves outward and fades. On phones the character, right-edge ornaments, and wand disappear, leaving a smaller palace and centered seal. A short-landscape composition protects the controls. Responsive transforms/opacity remain interruptible; no viewport-driven React state is used.

Only the base paper is visible in server HTML. At hydration commit, each complete artwork layer fades in over 350ms with 10ms staggering (0–120ms total delay). Complete decorative elements then float gently with CSS transforms. The official site floats through 2% vertically and bobs water by 5px; this scene uses a centered 1% total range capped at 6px, with 2.5px for water and 2px for the central seal. Scroll adds a smoothed offset capped at 120% of the idle peak (up to 3.6px), then settles back to idle. Patterns and the base remain static; there is no fragment animation, scaling, or rotation. Reduced motion disables both effects; hidden tabs pause drift, invisible phone elements do not animate, and preference wipes capture a complete scene. JavaScript schedules frames only while scroll momentum settles. See [redesign review](kingdom-review.md) for verification.

## Archived artwork

`background.svg` and `apps/web/public/images/versions/magical/background.webp` preserve the previous [Figma composition](https://www.figma.com/design/tFHSd2n2FsPw3rLgNT0ljC/Personal-Draft?node-id=6747-1412), based on Frame 2 (1626:81). The current kingdom redesign is maintained in `kingdom.svg`; that Figma frame has not been overwritten.

The official logo remains `apps/web/public/images/versions/magical/logo.webp`. Earlier releases retain their existing image renderer. This artwork change does not regenerate chart data or constants, and rank badges continue using the available CiRCLE PLUS assets.
