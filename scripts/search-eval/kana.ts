// Kana and romaji helpers for building the search eval set. Deliberately independent of the web app's search code so
// the eval does not grade the search with its own normalisation.

export const toHiragana = (value: string) =>
  value.replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))

export const toKatakana = (value: string) =>
  value.replace(/[ぁ-ゖ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))

export const isKana = (char: string) => /[ぁ-ゖァ-ヺー]/u.test(char)
export const hasKanji = (value: string) => /\p{Script=Han}/u.test(value)
export const hasKana = (value: string) => /[ぁ-ゖァ-ヺ]/u.test(value)
export const hasLatin = (value: string) => /[A-Za-zＡ-Ｚａ-ｚ]/u.test(value)

const DIGRAPHS: Record<string, [hepburn: string, kunrei: string]> = {
  きゃ: ['kya', 'kya'],
  きゅ: ['kyu', 'kyu'],
  きょ: ['kyo', 'kyo'],
  しゃ: ['sha', 'sya'],
  しゅ: ['shu', 'syu'],
  しぇ: ['she', 'sye'],
  しょ: ['sho', 'syo'],
  ちゃ: ['cha', 'tya'],
  ちゅ: ['chu', 'tyu'],
  ちぇ: ['che', 'tye'],
  ちょ: ['cho', 'tyo'],
  にゃ: ['nya', 'nya'],
  にゅ: ['nyu', 'nyu'],
  にょ: ['nyo', 'nyo'],
  ひゃ: ['hya', 'hya'],
  ひゅ: ['hyu', 'hyu'],
  ひょ: ['hyo', 'hyo'],
  みゃ: ['mya', 'mya'],
  みゅ: ['myu', 'myu'],
  みょ: ['myo', 'myo'],
  りゃ: ['rya', 'rya'],
  りゅ: ['ryu', 'ryu'],
  りょ: ['ryo', 'ryo'],
  ぎゃ: ['gya', 'gya'],
  ぎゅ: ['gyu', 'gyu'],
  ぎょ: ['gyo', 'gyo'],
  じゃ: ['ja', 'zya'],
  じゅ: ['ju', 'zyu'],
  じぇ: ['je', 'zye'],
  じょ: ['jo', 'zyo'],
  ぢゃ: ['ja', 'zya'],
  ぢゅ: ['ju', 'zyu'],
  ぢょ: ['jo', 'zyo'],
  びゃ: ['bya', 'bya'],
  びゅ: ['byu', 'byu'],
  びょ: ['byo', 'byo'],
  ぴゃ: ['pya', 'pya'],
  ぴゅ: ['pyu', 'pyu'],
  ぴょ: ['pyo', 'pyo'],
  ふぁ: ['fa', 'fa'],
  ふぃ: ['fi', 'fi'],
  ふぇ: ['fe', 'fe'],
  ふぉ: ['fo', 'fo'],
  てぃ: ['ti', 'ti'],
  でぃ: ['di', 'di'],
  とぅ: ['tu', 'tu'],
  どぅ: ['du', 'du'],
  うぃ: ['wi', 'wi'],
  うぇ: ['we', 'we'],
  うぉ: ['wo', 'wo'],
  ゔぁ: ['va', 'va'],
  ゔぃ: ['vi', 'vi'],
  ゔぇ: ['ve', 've'],
  ゔぉ: ['vo', 'vo'],
}

const MONOGRAPHS: Record<string, [hepburn: string, kunrei: string]> = {
  あ: ['a', 'a'],
  い: ['i', 'i'],
  う: ['u', 'u'],
  え: ['e', 'e'],
  お: ['o', 'o'],
  か: ['ka', 'ka'],
  き: ['ki', 'ki'],
  く: ['ku', 'ku'],
  け: ['ke', 'ke'],
  こ: ['ko', 'ko'],
  さ: ['sa', 'sa'],
  し: ['shi', 'si'],
  す: ['su', 'su'],
  せ: ['se', 'se'],
  そ: ['so', 'so'],
  た: ['ta', 'ta'],
  ち: ['chi', 'ti'],
  つ: ['tsu', 'tu'],
  て: ['te', 'te'],
  と: ['to', 'to'],
  な: ['na', 'na'],
  に: ['ni', 'ni'],
  ぬ: ['nu', 'nu'],
  ね: ['ne', 'ne'],
  の: ['no', 'no'],
  は: ['ha', 'ha'],
  ひ: ['hi', 'hi'],
  ふ: ['fu', 'hu'],
  へ: ['he', 'he'],
  ほ: ['ho', 'ho'],
  ま: ['ma', 'ma'],
  み: ['mi', 'mi'],
  む: ['mu', 'mu'],
  め: ['me', 'me'],
  も: ['mo', 'mo'],
  や: ['ya', 'ya'],
  ゆ: ['yu', 'yu'],
  よ: ['yo', 'yo'],
  ら: ['ra', 'ra'],
  り: ['ri', 'ri'],
  る: ['ru', 'ru'],
  れ: ['re', 're'],
  ろ: ['ro', 'ro'],
  わ: ['wa', 'wa'],
  ゐ: ['i', 'i'],
  ゑ: ['e', 'e'],
  を: ['o', 'o'],
  ん: ['n', 'n'],
  が: ['ga', 'ga'],
  ぎ: ['gi', 'gi'],
  ぐ: ['gu', 'gu'],
  げ: ['ge', 'ge'],
  ご: ['go', 'go'],
  ざ: ['za', 'za'],
  じ: ['ji', 'zi'],
  ず: ['zu', 'zu'],
  ぜ: ['ze', 'ze'],
  ぞ: ['zo', 'zo'],
  だ: ['da', 'da'],
  ぢ: ['ji', 'zi'],
  づ: ['zu', 'zu'],
  で: ['de', 'de'],
  ど: ['do', 'do'],
  ば: ['ba', 'ba'],
  び: ['bi', 'bi'],
  ぶ: ['bu', 'bu'],
  べ: ['be', 'be'],
  ぼ: ['bo', 'bo'],
  ぱ: ['pa', 'pa'],
  ぴ: ['pi', 'pi'],
  ぷ: ['pu', 'pu'],
  ぺ: ['pe', 'pe'],
  ぽ: ['po', 'po'],
  ゔ: ['vu', 'vu'],
  ぁ: ['a', 'a'],
  ぃ: ['i', 'i'],
  ぅ: ['u', 'u'],
  ぇ: ['e', 'e'],
  ぉ: ['o', 'o'],
  ゃ: ['ya', 'ya'],
  ゅ: ['yu', 'yu'],
  ょ: ['yo', 'yo'],
  ゎ: ['wa', 'wa'],
}

export type RomajiStyle = 'hepburn' | 'kunrei'

/**
 * Romanises a kana reading. `longVowels: 'keep'` writes the long-vowel mark as a repeated vowel (raamen, toukyou);
 * `'drop'` removes it and collapses ou/uu to a single vowel the way people type (ramen, tokyo).
 */
export function kanaToRomaji(
  reading: string,
  style: RomajiStyle = 'hepburn',
  longVowels: 'keep' | 'drop' = 'keep',
): string {
  const hira = toHiragana(reading)
  const index = style === 'hepburn' ? 0 : 1
  let out = ''
  let geminate = false
  for (let i = 0; i < hira.length; i++) {
    const char = hira[i]!
    const pair = hira.slice(i, i + 2)
    let syllable: string | undefined
    if (DIGRAPHS[pair]) {
      syllable = DIGRAPHS[pair][index]
      i++
    } else if (MONOGRAPHS[char]) {
      syllable = MONOGRAPHS[char][index]
    } else if (char === 'っ') {
      geminate = true
      continue
    } else if (char === 'ー') {
      if (longVowels === 'keep') {
        const lastVowel = out.match(/[aeiou]$/u)?.[0]
        if (lastVowel) out += lastVowel
      }
      continue
    } else {
      out += char
      continue
    }
    if (geminate) {
      out += style === 'hepburn' && syllable.startsWith('ch') ? 't' : syllable[0]
      geminate = false
    }
    // Hepburn writes ん as n' before vowels and y; typed queries never do, so keep a plain n.
    out += syllable
  }
  if (longVowels === 'drop')
    out = out
      .replace(/ou/gu, 'o')
      .replace(/uu/gu, 'u')
      .replace(/oo(?!$)/gu, 'o')
  return out
}

const DAKUTEN_BASE: Record<string, string> = Object.fromEntries(
  [...'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ'].map((char) => [char, char.normalize('NFD')[0]!]),
)
const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  っ: 'つ',
  ゎ: 'わ',
}
const VOWEL_OF: Record<string, string> = {}
for (const [kana, [romaji]] of Object.entries(MONOGRAPHS)) {
  const vowel = romaji.at(-1)!
  VOWEL_OF[kana] = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', n: 'ん' }[vowel] ?? ''
}

/**
 * The key SEGA's `title_kana` uses: katakana with dakuten and handakuten stripped, small kana enlarged, the long-vowel
 * mark spelled as its vowel, latin uppercased and everything else (spaces, punctuation) removed.
 */
export function officialSortKey(value: string): string {
  const hira = toHiragana(value.normalize('NFKC'))
  let out = ''
  let lastBase = ''
  for (const char of hira) {
    if (char === 'ー') {
      out += VOWEL_OF[lastBase] ?? ''
      continue
    }
    const large = SMALL_TO_LARGE[char] ?? char
    const base = DAKUTEN_BASE[large] ?? large
    if (/[ぁ-ゖ]/u.test(base)) {
      out += base
      lastBase = base
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      out += char.toUpperCase()
      lastBase = ''
    }
  }
  return toKatakana(out)
}