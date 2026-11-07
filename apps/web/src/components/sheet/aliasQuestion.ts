/*
 * The "是什么歌" ("what song is …?") form of a song alias that Chinese-speaking players share: the link
 * https://<label>.是什么歌.com, or the plain question "<alias>是什么歌" when the alias makes no valid hostname label.
 * The iOS app builds the same form with the same rules, so keep the two identical:
 *   1. NFKC-normalise, trim and lowercase the alias
 *   2. turn every run of whitespace and dots (. 。 ． ｡) into one "-": a dot would add a subdomain level, which the
 *      wildcard TLS certificate does not cover
 *   3. drop every character that is not a letter, a digit, a combining mark or "-"
 *   4. drop variation selectors (U+FE00–FE0F, U+E0100–E01EF), which hostname processing ignores, and every combining
 *      mark that no longer follows a letter or digit (at the start, or after "-"): IDNA rejects a label or part that
 *      starts with one, e.g. what is left of "⚔️🍎" (U+FE0F) or "(ﾟ∀ﾟ)" (two U+309A)
 *   5. collapse runs of "-" and trim "-" from both ends (a label cannot start or end with one)
 *   6. the label must be non-empty and at most 63 bytes once punycoded (xn--…); otherwise use the question form
 */

const SEPARATORS = /[\s.。．｡]+/gu
const INVALID = /[^\p{L}\p{N}\p{M}-]/gu
const VARIATION_SELECTORS = /[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu
const STRANDED_MARKS = /(^|-)\p{M}+/gu

/** The hostname label for an alias, or null when it makes none (empty, or longer than 63 bytes as punycode) */
export function aliasHostLabel(alias: string): string | null {
  const label = alias
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(SEPARATORS, '-')
    .replace(INVALID, '')
    .replace(VARIATION_SELECTORS, '')
    .replace(STRANDED_MARKS, '$1')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!label) return null
  return toAsciiLabel(label).length <= 63 ? label : null
}

/** What clicking an alias copies in Chinese locales, and what the toast names */
export function aliasQuestion(alias: string): { clipboard: string; toastContent: string } {
  const label = aliasHostLabel(alias)
  if (label) return { clipboard: `https://${label}.是什么歌.com`, toastContent: `${label}.是什么歌.com` }
  const question = `${alias.trim()}是什么歌`
  return { clipboard: question, toastContent: question }
}

/** A label as it goes on the wire: itself if ASCII, else "xn--" and its RFC 3492 punycode */
export function toAsciiLabel(label: string): string {
  // oxlint-disable-next-line no-control-regex -- ASCII range check
  return /^[\x00-\x7f]*$/.test(label) ? label : `xn--${punycode(label)}`
}

// RFC 3492 encoder (the parameters of section 5)
const BASE = 36
const T_MIN = 1
const T_MAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128

const digit = (d: number) => String.fromCharCode(d < 26 ? d + 97 : d + 22)

function adapt(delta: number, points: number, first: boolean) {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / points)
  let k = 0
  while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
    delta = Math.floor(delta / (BASE - T_MIN))
    k += BASE
  }
  return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + SKEW))
}

function punycode(input: string): string {
  const codePoints = Array.from(input, (char) => char.codePointAt(0)!)
  let output = codePoints
    .filter((c) => c < 0x80)
    .map((c) => String.fromCharCode(c))
    .join('')
  const basic = output.length
  let handled = basic
  if (basic > 0) output += '-'
  let n = INITIAL_N
  let delta = 0
  let bias = INITIAL_BIAS
  while (handled < codePoints.length) {
    const m = Math.min(...codePoints.filter((c) => c >= n))
    delta += (m - n) * (handled + 1)
    n = m
    for (const c of codePoints) {
      if (c < n) delta++
      if (c !== n) continue
      let q = delta
      for (let k = BASE; ; k += BASE) {
        const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias
        if (q < t) break
        output += digit(t + ((q - t) % (BASE - t)))
        q = Math.floor((q - t) / (BASE - t))
      }
      output += digit(q)
      bias = adapt(delta, handled + 1, handled === basic)
      delta = 0
      handled++
    }
    delta++
    n++
  }
  return output
}