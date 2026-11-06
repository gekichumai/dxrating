// Text keys for the sheet search. Both the index and the query go through the same functions, so a query matches when
// its key equals (or prefixes, or contains) a key of the song, whatever script or spelling the person typed.
//
// - `normalizeText`: NFKC (full width → half width), lowercase, katakana → hiragana, latin diacritics and stylised letters
//   folded (Λ → a, Φ → o, ø → o). Keeps spaces, so substring matching can still work per word.
// - `compactKey`: `normalizeText` without spaces, punctuation or symbols. "Beat Opera op.1" and "beatoperaop1" are equal.
// - `skeletonKey`: `compactKey` with kana romanised and romaji spelling variants folded together, so ありきたり,
//   アリキタリ, "arikitari" and "arikitari" with any Hepburn/Kunrei spelling, long vowels or doubled n all meet.

/** Letters titles use as stylised latin ("FLΛME/FRΦST", "Åntinomiε") */
const STYLISED_LATIN: Record<string, string> = {
  λ: 'a',
  Λ: 'a',
  '∀': 'a',
  δ: 'a',
  Δ: 'a',
  φ: 'o',
  Φ: 'o',
  ø: 'o',
  Ø: 'o',
  θ: 'o',
  Θ: 'o',
  '✪': 'o',
  ε: 'e',
  Ε: 'e',
  ξ: 'e',
  Ξ: 'e',
  σ: 'e',
  Σ: 'e',
  я: 'r',
  Я: 'r',
  ß: 'ss',
}

const toHiragana = (value: string) =>
  value.replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))

/** NFKC, lowercase, katakana as hiragana, latin without diacritics, stylised letters as latin */
export function normalizeText(value: string): string {
  let out = ''
  for (const char of value.normalize('NFKC')) {
    const stylised = STYLISED_LATIN[char]
    if (stylised) out += stylised
    else if (/\p{Script=Latin}/u.test(char)) out += char.normalize('NFD').replace(/\p{M}/gu, '')
    else out += char
  }
  return toHiragana(out.toLowerCase())
}

/** The normalized text with whitespace, punctuation and symbols removed (the long-vowel mark stays) */
export const compactKey = (value: string) => normalizeText(value).replace(/[^\p{L}\p{N}ー]/gu, '')

const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きぇ: 'kye',
  きょ: 'kyo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  しゃ: 'sya',
  しゅ: 'syu',
  しぇ: 'sye',
  しょ: 'syo',
  じゃ: 'zya',
  じゅ: 'zyu',
  じぇ: 'zye',
  じょ: 'zyo',
  ちゃ: 'tya',
  ちゅ: 'tyu',
  ちぇ: 'tye',
  ちょ: 'tyo',
  ぢゃ: 'zya',
  ぢゅ: 'zyu',
  ぢょ: 'zyo',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ふぁ: 'ha',
  ふぃ: 'hi',
  ふぇ: 'he',
  ふぉ: 'ho',
  てぃ: 'ti',
  でぃ: 'di',
  とぅ: 'tu',
  どぅ: 'du',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  ゔぁ: 'ba',
  ゔぃ: 'bi',
  ゔぇ: 'be',
  ゔぉ: 'bo',
  つぁ: 'tua',
}

const MONOGRAPHS: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  さ: 'sa',
  し: 'si',
  す: 'su',
  せ: 'se',
  そ: 'so',
  ざ: 'za',
  じ: 'zi',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  た: 'ta',
  ち: 'ti',
  つ: 'tu',
  て: 'te',
  と: 'to',
  だ: 'da',
  ぢ: 'zi',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'hu',
  へ: 'he',
  ほ: 'ho',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'o',
  ん: 'n',
  ゔ: 'bu',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ゎ: 'wa',
  ゕ: 'ka',
  ゖ: 'ke',
}

/** Romanises the hiragana in a normalized string (Kunrei-style); other characters pass through */
function romanise(value: string): string {
  let out = ''
  let geminate = false
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!
    const pair = value.slice(i, i + 2)
    let syllable = DIGRAPHS[pair]
    if (syllable) i++
    else syllable = MONOGRAPHS[char]
    if (char === 'っ') {
      geminate = true
      continue
    }
    if (char === 'ー') {
      // The vowel repeats; skeletons collapse it again, so only the vowel matters
      const vowel = out.match(/[aeiou]$/u)?.[0]
      if (vowel) out += vowel
      continue
    }
    if (!syllable) {
      geminate = false
      out += char
      continue
    }
    if (geminate && /^[a-z]/u.test(syllable) && !/^[aeiou]/u.test(syllable)) out += syllable[0]
    geminate = false
    out += syllable
  }
  return out
}

// Order matters: digraph spellings first, then single letters, then vowel length
const ROMAJI_FOLDS: [RegExp, string][] = [
  [/tsu/gu, 'tu'],
  [/shi/gu, 'si'],
  [/chi/gu, 'ti'],
  [/sh/gu, 'sy'],
  [/tch/gu, 'tty'],
  [/ch/gu, 'ty'],
  [/ji/gu, 'zi'],
  [/j/gu, 'zy'],
  [/dzu/gu, 'zu'],
  [/du/gu, 'zu'],
  [/fu/gu, 'hu'],
  // を is typed as both "o" and "wo"
  [/wo/gu, 'o'],
  [/f(?=[aeio])/gu, 'h'],
  [/v(?=[aeiou])/gu, 'b'],
  [/l/gu, 'r'],
  [/m(?=[bpm])/gu, 'n'],
  [/nn/gu, 'n'],
  [/ou|oo|oh(?![aeiou])/gu, 'o'],
  [/uu/gu, 'u'],
  [/aa/gu, 'a'],
  [/ii/gu, 'i'],
  [/ee/gu, 'e'],
]

/**
 * A spelling-insensitive key for kana and romaji: ありきたり, アリキタリ, "arikitari" share one; so do "shi"/"si",
 * "tsu"/"tu", "chi"/"ti", "fu"/"hu", "ji"/"zi", "ou"/"oo"/"o", "nn"/"n", "l"/"r". Kanji and other scripts pass
 * through unchanged.
 */
export function skeletonKey(value: string): string {
  let out = romanise(compactKey(value))
  for (const [pattern, replacement] of ROMAJI_FOLDS) out = out.replace(pattern, replacement)
  // A run of the same vowel is one long vowel
  return out.replace(/([aeiou])\1+/gu, '$1')
}

/** For each word of the normalized text, the compact text from that word to the end ("the great journey" →
 * thegreatjourney, greatjourney, journey) */
export function wordSuffixes(normalized: string): string[] {
  const words = normalized.split(/[^\p{L}\p{N}ー]+/u).filter(Boolean)
  return words.map((_, i) => words.slice(i).join(''))
}