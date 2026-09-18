import { readFile, writeFile } from 'node:fs/promises'

// Reuse the web theme's vector layers, composed for the 1500 × 1300 rating card.
// Run from the repository root: node apps/backend/scripts/generate-magical-background.mjs
const source = await readFile(new URL('../../web/src/assets/magical-background.svg', import.meta.url), 'utf8')
const artwork = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1300" viewBox="0 0 1500 1300">
  <defs>${artwork}</defs>
  <use href="#paper" transform="scale(.75 .542)" />
  <use href="#atmosphere" transform="scale(.75 .542)" />
  <use href="#pattern" transform="translate(0 -250) scale(.75)" opacity=".65" />
  <use href="#ribbons" transform="translate(0 -250) scale(.75)" opacity=".65" />
  <use href="#sky-orbit" transform="translate(1430 35) rotate(-18) scale(.62)" opacity=".8" />
  <use href="#edge-magic" transform="scale(.75 .542)" opacity=".75" />
  <use href="#emblems" transform="translate(750 650) scale(.72) translate(-1000 -1200)" opacity=".7" />
  <use href="#lagoon" transform="translate(0 -500) scale(.75)" opacity=".8" />
  <use href="#water-orbit" transform="translate(35 1280) rotate(20) scale(.5)" />
  <use href="#palace" transform="translate(80 1270) scale(.65)" opacity=".7" />
  <use href="#wand" transform="translate(110 330) rotate(-27) scale(.65)" opacity=".55" />
  <use href="#corners" transform="scale(.75 .542)" />
</svg>`
const target = new URL('../src/services/functions/oneshot-renderer/magicalBackground.generated.ts', import.meta.url)
await writeFile(
  target,
  `// Generated from apps/web/src/assets/magical-background.svg.\n// Regenerate: node apps/backend/scripts/generate-magical-background.mjs\n// Bundled inline so exports need neither the web deployment nor remote theme assets.\nexport const MAGICAL_BACKGROUND_SVG = ${JSON.stringify(svg)}\n`,
)