# MAGiCAL kingdom redesign review

Reviewed September 17, 2026 against the live official site's scenery and the user's preference for Frame 2, a patterned center, editable SVG elements, and gentle parallax.

## Review

| Area | Decision and evidence |
| --- | --- |
| Typography | Existing localized controls remain unchanged. Artwork contains no text, avoiding additional fonts and untranslated copy. |
| Surfaces | Aqua water and mint gardens replace the stronger clockwork motif. Coral roofs, pale columns, looping staffs, a diamond field, and small constellation fragments establish the new kingdom theme. |
| Animations | Complete artwork layers fade in after hydration (350ms duration, 10ms stagger), then drift gently. CSS owns idle movement; bounded JavaScript scroll offsets settle back to zero. Reduced motion reveals artwork immediately and disables movement. |
| Icons and illustration | Original vector scenery uses shared symbols. The central magic-hat seal is centered using its measured alpha centroid. Existing official character artwork stays separate. |
| Performance | Runtime artwork decreases from 63,863 to 37,798 bytes, about 5 KB compressed. Fourteen anchored SVG views share one resource request. No dependencies or new raster downloads are added. |

## Changes

- Added the canonical `kingdom.svg` and regenerated the shared runtime asset.
- Replaced mechanical clock groups with sky and water orbits; updated renderer, motion configuration, and tests consistently.
- Expanded the palace viewBox to include the floating island beneath it.
- Clipped edge views to prevent opposite-edge ornaments from leaking outside their slice.
- Lowered character opacity on desktop and tablet to protect chart readability.
- Added the editable Figma frame `6748:3454`. Native import required explicit diamond paths and rune colors; `kingdom-figma.svg` preserves those corrections without increasing the runtime payload.

## Deliberate omissions

- No stronger scroll effects: the user requested smaller movement amplitudes.
- No continuously animated particles: they would add distraction and keep rendering active at rest.
- No raster scenery from the official site: original vectors preserve responsiveness and shared-resource loading.
- No hero/logo replacement based on the site's stale CiRCLE PLUS identity images. The current MAGiCAL announcement assets remain in use.

## Verification

- Production build passed; focused motion, preference, and transition tests passed (30 tests in seven files).
- Lint passed with no errors and 24 existing warnings; formatting passed.
- XML inspection found unique IDs, resolved internal references, and no external raster image dependencies in the runtime SVG.
- Chrome desktop at 1440 × 1000 and phone at 390 × 844 visually inspected. The phone hides the character and retains readable content without horizontal overflow.
- Japanese production preview inspected; the center seal matched the usable viewport center and the browser recorded one shared SVG request.
- Figma desktop import visually inspected for the diamond field, gold runes, named groups, centered seal, and placement beside the prior artwork.

Safari, Firefox, and physical devices were not retested for this artwork-only revision. Deployment is separate from this local and Figma verification.

## Hydration entrance follow-up

Full review scoped to `MagicalBackground.tsx`, `magicalMotion.ts`, and `magical-background.css` (React, existing plain CSS). Typography and icon shapes are unchanged; surface visibility, entrance timing, and runtime work were inspected.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `magicalMotion.ts`, `magical-background.css` | Entrance began when CSS loaded; scroll changed SVG transforms | Hydration ref gates a whole-layer opacity fade; no scroll listeners or frame loop | Matches the requested base-only initial HTML and restrained entrance |
| LOW | `magical-background.css` | 1000ms entrance, up to 480ms delay, translation/rotation/scale | 350ms opacity-only entrance, 10ms increments ending at 120ms | Keeps the reveal brief and eliminates fragment-like movement |

Rejected: retaining parallax conflicts with the new entrance-only request; a motion dependency adds no value for simple CSS opacity keyframes; removing artwork from server markup would create unnecessary client-only tree changes.

Verified the Japanese production preview with JavaScript disabled: base paper opacity 1, all 13 decorative layers opacity 0, no animations. After hydration the ready marker is present and artwork is visible; the browser console has no errors. Reduced-motion emulation showed all artwork visible with no animations. A slowed replay was initiated at 10% playback rate; a full time-resolved visual replay was not captured. Strict Mode cleanup, SSR hydration parity, preference wipe readiness, and lack of scroll frame work are covered by the focused tests.

Verdict: Approve. Unverified: Safari, Firefox, physical devices, and full slow-motion visual replay.

## Gentle idle and scroll follow-up (current)

This supersedes the earlier entrance-only motion decision. The user requested continuous subtle movement and a slightly stronger scroll response. Live official CSS was re-fetched on September 17: `floating` moves 0–2% vertically and `updown` moves 0–5px. The new centered range is 1% capped at 6px (±3px), water 2.5px total, and the seal 2px total. Scroll peaks at 1.2 times each idle peak. Per-element phases and 5–8 second half-cycles avoid synchronized bobbing; the pattern and paper remain still.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | `magical-background.css` | Static artwork after hydration | Whole-element vertical drift with half the reference travel, no fragment motion | Implements the requested continuous movement with restrained amplitude |
| LOW | `magicalMotion.ts` | No scroll response | Bounded, smoothed offset at 120% of idle peak; no JavaScript work at rest | Keeps scroll and idle movement visually consistent |
| MEDIUM | CSS and ref cleanup | Only reduced-motion entrance support | Pause hidden-tab drift, disable invisible-layer drift and reduced-motion movement, clean up all listeners | Avoids unnecessary work and preserves accessibility |

Typography, icon shapes, base surfaces, and responsive composition are unchanged. Animation and performance paths were inspected. Rejected: a JavaScript idle loop (CSS can own transforms); replicating the official continuously scrolling cloud textures (would require more travel or raster tiling); stronger rotation/scale effects (conflict with the requested slight movement).

Verified production Japanese preview: no console errors; measured palace endpoints −3px/+3px; scroll coefficient approached −0.6 of the full range and settled to an empty inline translate while idle continued. Reduced-motion emulation produced zero active background animations. At 390px wide, character, wand, and right-edge artwork had opacity zero and no float animation. Thirty focused tests pass; build and lint pass (24 existing warnings). Formatting and diff whitespace checks pass. No new dependencies or asset requests.

Verdict: Approve. Unverified: Safari, Firefox, physical devices, and an extended slow-motion visual review.
