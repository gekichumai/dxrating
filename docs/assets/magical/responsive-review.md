# MAGiCAL responsive background review

Mode: **full**. Scope: the MAGiCAL background renderer, its responsive composition, and compatibility with search and version changes. Framework: React 19 with the existing UnoCSS/MUI interface and plain CSS for global decoration. This does not redesign the search controls, typography, or other version artwork.

## Coverage

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Japanese search labels, chart names/values, coming-soon notice, and empty search over the new scene at phone/tablet/desktop sizes | Clear within this scope; no type changes |
| Surfaces | `MagicalBackground.tsx`, CSS anchors, rendered optical center, character position, narrow and short viewports | Responsive cropping and alignment addressed |
| Animations | CSS breakpoint transitions at normal and 10% speed, mid-flight reversal, initial render, reduced motion, circular version wipe | Clear |
| Icons | Decorative SVG motifs, `aria-hidden`, `focusable`, pointer behavior, version selector keyboard interaction | Clear; interactive icon design unchanged |
| Performance | Production resource timing, sprite reuse, asset sizes, initial animation count, SSR markup, build | Clear |

## Changes made

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `apps/web/src/components/global/backgrounds/VersionBackground.tsx:5`, `apps/web/src/theme.ts:6`, `apps/web/src/routes/__root.tsx:178` | Every release used a single cropped image | MAGiCAL selects an SVG scene; earlier versions retain their image/resolution behavior | Responsive composition needs independent elements |
| MEDIUM | `apps/web/src/components/global/backgrounds/MagicalBackground.tsx:19`, `apps/web/src/components/global/backgrounds/magical-background.css:103` | Character, palace, patterns, and edge ornaments were flattened together | 14 anchored SVG layers; secondary ornaments move/fade at 1100px and 600px, with a short-landscape adjustment | Keep the dense identity while protecting limited space |
| LOW | `apps/web/src/components/global/backgrounds/MagicalBackground.tsx:29` | Optical centering existed only in the flat export | An explicitly centered viewBox preserves the measured alpha centroid at every size | Optical over geometric alignment |
| LOW | `apps/web/src/components/global/backgrounds/magical-background.css:95` | The initial layered character overlapped too much of the right chart column | Cap its width at 360px and shift it farther toward the lower-right edge | Protect text contrast without removing the artwork |
| MEDIUM | `apps/web/src/components/global/backgrounds/magical-background.css:12`, `apps/web/src/components/global/backgrounds/magical-background.css:198` | Flat image had no independent responsive motion | Interruptible transform/opacity transitions only; no entrance or idle animation; reduced motion disables transitions | Motion restraint, interruption, and accessibility |
| LOW | `apps/web/src/assets/magical-background.svg:1`, `scripts/export-magical-background.py:1`, `docs/assets/magical/README.md:25` | The editable SVG embedded a PNG; runtime used a 202 KiB flattened image | Reproducible vector sprite plus a fingerprinted character WebP, with documented export commands | Reuse vectors without base64 or resize-driven React state |

## Considered but rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| `MagicalBackground.tsx` | Add Motion and JavaScript viewport detection | CSS already resolves the initial layout before hydration and retargets responsive transitions |
| `magical-background.css` | Loop sparkles, rotate clocks, or add pointer parallax | Persistent motion behind frequently read chart data would distract; the requested responsive changes provide sufficient motion |
| `magical-background.css` | Animate width/height or add permanent `will-change` to every layer | Transform/opacity are sufficient; no observed first-frame stutter justified extra compositing hints |

## Verification

- `python3 scripts/export-magical-background.py`: exported the reusable vector groups from the editable source.
- `pnpm lint`: 0 errors (24 existing warnings).
- `pnpm format`: passed.
- `pnpm build`: all 4 tasks passed, including TypeScript and production SSR/client bundles.
- `pnpm --filter @gekichumai/dxrating-web exec vitest run src/components/global/backgrounds/__tests__ src/components/global/preferences/__tests__ src/utils/__tests__/startViewTransition.test.tsx`: 24 tests passed.
- Production preview in Chrome with `locale=ja`: inspected 320×568, 390×844, 820×1180, 844×390, 1200×900, and 1440×1000. No horizontal overflow or application hydration errors. An existing Motion deprecation warning occurred in the development build before switching to production preview.
- Initial MAGiCAL scene: 14 SVG layers and 0 background animations. The browser fetched the sprite once and the character once: 63,863 and 62,996 uncompressed bytes. The sprite gzips to about 8.3 KiB; actual production compression depends on delivery.
- Optical center: tablet measured `(402.5, 590)` for an 805×1180 content viewport; desktop measured `(712.5, 500)` for a 1425×1000 content viewport. Both match the usable viewport center, excluding the scrollbar.
- Slowed transitions using browser animation playback rate `0.1`: inspected opacity/transform changes and reversed the viewport across breakpoints mid-flight. The character retargeted from opacity `0.0331` toward `0`, without flashing to its fully visible state.
- Emulated reduced motion: transition duration `0s`, 0 active background animations after resize.
- Search: inspected loading, populated, focused input, and 0-result states. Decorations stay passive and do not block controls. No separate hover/active state applies to the decorative layers.
- Switched CiRCLE PLUS → MAGiCAL: old release still uses its CDN WebP; paused the circular wipe midway and visually confirmed the complete SVG scene in the revealed area. Returned to Japan/MAGiCAL and cleared temporary search/debugging changes.
- Not verified: Safari/Firefox rendering and physical-device rotation. Chrome responsive emulation and keyboard input were exercised.

**Verdict: Approve.** No actionable interface-polish findings remain in the inspected scope. Unverified coverage: Safari, Firefox, physical-device rotation.
