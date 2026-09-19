# Oneshot renderer

Render DXRating Best 50 images without coupling drawing code to Hono, Sentry, the database, or rating calculations. Stage 1 preserves the existing design, glyph outlines, line heights, positions, and output formats.

## Use

```ts
import { createAssetLoader, createOneshotRenderer, createRenderService } from '@gekichumai/oneshot-renderer'

const loadAsset = createAssetLoader({
  baseDir: process.env.ASSETS_BASE_DIR,
  cacheDir: '/tmp/dxrating-assets',
  remoteUrl: 'https://shama.dxrating.net',
})
const render = createRenderService(createOneshotRenderer({ loadAsset, revision: '796d7ca' }))
const image = await render(input, { format: 'png', width: 1500 })
```

`RenderInput` contains presentation data only. Callers calculate ratings and select B35/B15 entries before drawing. The backend wraps both calculation and drawing in the render service, so cache hits and coalesced requests also skip recalculation. Asset loaders are injected; `createAssetLoader` is the Node filesystem/HTTP adapter. The backend supplies its existing gray-image fallback through `loadImage`; required fonts still fail loudly and can be retried.

`ASSETS_BASE_DIR` is a read-only source directory. `ASSETS_LOCAL_CACHE_DIR` is the writable download cache. Existing deployments using only the latter keep working. Updating assets requires restarting the process or changing its asset-source configuration. Use a separate cache directory for each remote asset origin; a disk cache is not automatically invalidated by changing the origin URL.

Run `pnpm --filter @gekichumai/oneshot-renderer build` before importing the compiled package. `pnpm dev` watches package changes; the backend's own dev command builds it before startup. Turbo builds, backend CI, and Docker also build the package before the backend.

## Compatibility decision

| Component | Previous | Stage 1 | Evidence |
| --- | --- | --- | --- |
| Layout and glyph paths | Satori 0.26.0 | **0.29.0, exact pin** | Identical SVG and decoded pixels across the fixture corpus |
| SVG rasterization | resvg 2.6.2 | **2.6.2, exact pin** | Already the current release when evaluated; system font loading disabled because text is embedded as paths |
| PNG/JPEG encoding | Sharp 0.34.5 | **0.35.4, exact pin** | Identical decoded PNG and JPEG pixels |

Satori 0.33.4 was evaluated, but its HarfBuzz shaping changed widths and positions in the existing layout: **18,219 pixels (0.9343%)** differed in the full 1500×1300 fixture. Disabling kerning and ligatures did not restore parity. Do not substitute that version without a new compatibility investigation. [Satori documents its shaping and font-path behavior](https://github.com/vercel/satori#language-and-typography).

The Skia-backed `@napi-rs/canvas` 1.0.9 SVG import was also evaluated. Embedded artwork was absent in the trial, including after adding xlink image references; **63.61%** of pixels differed. This rejects that direct SVG import path for Stage 1, not Skia as a drawing engine. A direct Skia implementation needs a drawing model and explicit typography work, which belongs with the later redesign. [Canvas API and examples](https://github.com/Brooooooklyn/canvas).

There are no compensating one-pixel offsets or relaxed image thresholds in Stage 1.

The latest main branch's bundled MAGiCAL SVG background and fallback artwork for older or newly accepted versions are preserved in this package. Its version-theme regression tests now run with the renderer tests. Regenerate that background with `node packages/oneshot-renderer/scripts/generate-magical-background.mjs`; the original seven-theme visual references remain unchanged.

## Verify output

```sh
pnpm --filter @gekichumai/oneshot-renderer test
ASSETS_BASE_DIR=/absolute/path/to/dxrating-assets \
  pnpm --filter @gekichumai/oneshot-renderer test:visual
```

Visual verification checks 10 scenes in SVG, PNG, and JPEG: all seven themes, full/empty/sparse grids, player/no-player headers, mixed Latin/CJK text, clipped titles, all difficulties, accuracy/sync badges, DX stars, and 750/1500/3000-pixel widths. SVG hashes must match exactly. Raster comparisons hash decoded RGBA, so lossless container metadata cannot conceal or create a pixel mismatch. JPEG dimensions and decoded pixels are checked separately.

References were captured **before changing the renderer**, at repository revision `796d7ca`, using Satori 0.26.0, resvg 2.6.2 and Sharp 0.34.5. The footer revision is fixed to `796d7ca`; the fixture presentation data is frozen and does not depend on future catalog updates. `test/fixtures/assets.json` records SHA-256 hashes of every asset. Visual verification rejects missing or changed assets and never substitutes placeholders or downloads files. `ASSETS_LOCAL_CACHE_DIR` can supply missing reference assets. The local capture used the supplied asset library's equivalent path under `/Users/galvin/Projects`, with `circle-plus.jpg` supplied by the existing iOS B50 asset bundle.

Generated images and `report.json` go to `artifacts/` (or `RENDER_ARTIFACT_DIR`), which is ignored by Git. Licensed font files and artwork are not copied into the package. Regular CI runs the unit tests; the full visual gate requires the matching asset library. Do not update golden hashes simply to make an engine upgrade pass.

The initial acceptance run passed all 30 comparisons on both macOS arm64 and a Linux amd64 Docker build restricted to **2 CPUs and 4 GiB RAM**, with networking disabled and reference assets mounted read-only. The Linux run was local under emulation; it establishes platform compatibility and pixel parity, not production VPS timing.

The final production container also rendered the full PNG with matching pixels and a working cache using only production dependencies and Node's native TypeScript transform. That isolated renderer smoke test peaked at approximately **529 MiB RSS**; it does not include normal backend traffic or database workloads.

## Resource use and performance

- One active render and eight queued unique requests by default. Identical requests share work; a full queue returns HTTP 503 with `Retry-After: 1` in the backend adapter.
- Final images/SVG: 32 MiB maximum, 32 entries maximum, five-minute TTL, least-recently-used eviction.
- Asset bytes: 64 MiB maximum, 256 entries maximum, six concurrent loads, coalesced downloads, ten-second HTTP timeout, atomic disk-cache writes.
- Reuse font objects; retry failed font initialization. Preserve exact Buffer view boundaries for both images and responses.

These limits bound application caches and concurrent work, not total process RSS. Parsed fonts, Satori's own caches, native raster buffers and the rest of the backend also use memory. Satori layout remains CPU work on Node's main thread; native rasterization and encoding use asynchronous APIs. A dedicated worker is a future option if request latency measurements justify its extra memory.

On this Apple Silicon Mac with Node 25.9.0, seven alternating warm 1500px JPEG trials measured a median **989 ms before vs 781 ms after (21% lower)**. The comparison used preloaded identical assets and the same Sharp 0.35.4 encoder to isolate layout/raster changes. One warmup per engine; no full-image cache. A three-request duplicate burst invoked one render; a service cache hit took approximately 0.7 ms. This is a local comparison, not a VPS speed claim. The actual backend endpoint was also checked for exact PNG pixels at all three widths, including coalesced and cached responses.

## iOS and the later redesign

The adjacent `dxrating-ios` repository already implements local B50 generation in `Features/Rating/RatingShare.swift`, using Core Text and `UIGraphicsImageRenderer`, bundled fonts/decorations, and bounded cover downloads. Extend and benchmark that existing implementation before adding another engine. Rendering locally removes the server round trip once assets are cached; cold artwork downloads, shaping, decoding and PNG encoding still contribute to latency. A GPU alone does not establish end-to-end export performance.

This package is a Node renderer, not directly executable Swift code. Its serializable presentation input and fixed visual corpus are useful shared boundaries. For Stage 2, define a versioned layout/typography specification and compare native outputs against it. Preserve explicit baselines, font-file hashes, line-height rules and point-to-pixel scale across platforms. Benchmark the existing native path on a real iPhone, including main-thread responsiveness, before deciding whether a shared Skia implementation is worth the integration cost. No iOS code or visual redesign is included in Stage 1.
