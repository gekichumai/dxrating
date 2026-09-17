# MAGiCAL motion review

Mode: **full**. Scope: initial background entrance, scroll velocity choreography, responsive transitions, and compatibility with the existing preference wipe. React 19; existing plain CSS plus a DOM ref lifecycle. No new dependency or artwork download.

## Coverage

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Japanese populated/empty search, notice, labels over moving artwork | Clear; text styles unchanged |
| Surfaces | Desktop, tablet, phone, short landscape; measured emblem centers and overflow | Clear; existing optical center preserved at rest |
| Animations | Entrance at normal/10% playback; scroll reversal/settling; responsive changes; native version wipe; reduced motion | Clear |
| Icons | Decorative SVG nodes remain aria-hidden, unfocusable, and pointer-transparent | Clear; interactive icons unchanged |
| Performance | Production frame timings, pending-frame lifecycle tests, hidden artwork exclusion, SSR and build | Clear within Chrome desktop and viewport emulation; physical mobile not verified |

## Changes made

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | `apps/web/src/components/global/backgrounds/magical-background.css:22` | Artwork immediately static on load | Atmosphere/pattern fade first, followed by motifs and foreground artwork; entrance offsets capped at 10px, 1 degree rotation, and 2 percent scale | User-requested intentional staged entrance, with transformation and opacity only |
| LOW | `apps/web/src/components/global/backgrounds/magicalMotion.ts:10` | No response to page movement | Nine layers respond with gentle parallax: under 8px translation and 0.75 degrees rotation even at peak velocity; everything returns home | Distinct depth and momentum without perpetual movement |
| MEDIUM | `apps/web/src/components/global/backgrounds/MagicalBackground.tsx:19` | Each SVG owns responsive positioning directly | Aspect-ratio wrapper owns responsive layout; inner SVG owns entrance transform and independent scroll translate/rotate | Prevent animations from overwriting responsive geometry |
| MEDIUM | `apps/web/src/components/global/backgrounds/magicalMotion.ts:32` | New continuous motion could waste frames or accumulate hidden-tab velocity | Coalesced passive listener, timestamp-based decay, explicit idle/visibility/unmount cancellation; mobile strength halved and hidden artwork skipped | Bounded cost and consistent behavior across refresh rates |
| MEDIUM | `apps/web/src/components/global/backgrounds/magical-background.css:291` | Existing reduced-motion rule only removed responsive transitions | Removes entrance and scroll transforms too; media change immediately cancels the animation loop | Preserve accessibility for all new movement |
| MEDIUM | `apps/web/src/components/global/backgrounds/magicalMotion.ts:3` | New entrance could expose a hidden first frame in a version wipe snapshot | Remember wipe state on mount and show the complete composition throughout and after the wipe | Avoid double entrances and a blank snapshot |

## Considered but rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Entrance | Animated blur, glow filters, and a full-screen light sweep | Large translucent SVG surfaces already require compositing; opacity and transforms express the staging without added filter work |
| Scroll | Permanent rAF loop, React state per frame, or additional Motion plumbing | A small shared loop wakes only for actual scrolling and stops after settling; no additional runtime dependency is needed |
| Artwork | Infinite floating, sparkles, or accumulated clock rotation | Charts need a quiet resting state and the central emblems must return to their optical alignment |
| CSS | Permanent will-change on every layer | No observed first-frame issue justified retaining 14 compositing surfaces |

## Verification

- `pnpm lint`: 0 errors, 24 pre-existing warnings.
- `pnpm format`: passed.
- `pnpm build`: all 4 build tasks passed, including production client/server bundles and TypeScript.
- `pnpm --filter @gekichumai/dxrating-web exec vitest run src/components/global/backgrounds/__tests__ src/components/global/preferences/__tests__ src/utils/__tests__/startViewTransition.test.tsx`: 32 tests passed. Covers deterministic SSR; legacy backgrounds; idle scheduling; coalescing; bounded impulses; direction reversal; 60/120 Hz behavior; reduced-motion changes; mobile exclusions; hidden-tab reset; Strict Mode/unmount cleanup; wipe entrance suppression; existing preferences/wipe behavior.
- Production preview `search?locale=ja`, Chrome: inspected 1440×1000, 390×844, 820×1180 and 844×390. No horizontal overflow or browser error logs/hydration errors.
- Entrance inspected at playback rate 0.1 and paused at 350ms: atmosphere/pattern visible, central motifs arriving, palace beginning, character/wand still waiting. Then played the full sequence; all animations finish rather than loop.
- Reduced-amplitude revision: `pnpm lint`, `pnpm format`, `pnpm build`, and all 10 background tests passed. Regression coverage enforces <8px translation and <0.75 degrees rotation even during sustained fast scrolling. The shared scroll lifecycle is unchanged.
- Desktop fast scrolling and reversal in the final production preview: clock rotation ranged −0.515° to +0.511°; wand vertical travel ranged −7.095px to +7.156px. All inline motion styles were removed after settling. Exactly one shared SVG resource request was recorded; the existing character WebP remains separate.
- Phone viewport fast scroll and reversal: clock range −0.239° to +0.246°; no horizontal overflow or browser errors; all motion settled.
- Softer entrance inspected at 10% playback, paused at 450ms: central motif scale begins at 0.98, smaller edge movement, late foreground fades remain staggered.
- Optical centers at rest: desktop (712.5, 500), phone (187.5, 422), tablet (402.5, 590), landscape (414.5, 195), each matching the usable viewport excluding its scrollbar.
- Reduced motion: reloaded with preference enabled, then scrolled 500px; 0 background animations and no inline motion transforms on all 14 layers.
- CiRCLE PLUS → MAGiCAL via the real version picker: complete scene, `data-skip-entrance` set, no entrance animation after the circular wipe.
- Populated/empty search and focused input exercised; decorations did not intercept input or replay on typing. No decorative hover/active state applies.
- Not verified: Safari, Firefox, physical phones/tablets, or low-end hardware. Responsive emulation does not reproduce mobile GPU/memory constraints.

**Verdict: Approve.** No actionable findings remain within tested scope. Unverified: Safari, Firefox, physical devices and low-end hardware.
