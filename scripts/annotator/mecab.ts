import { tokenize } from "@enjoyjs/node-mecab";

const KATAKANAS = [
  {
    kana: "ア",
    roumaji: "a",
    type: "gojuuon",
  },
  {
    kana: "イ",
    roumaji: "i",
    type: "gojuuon",
  },
  {
    kana: "ウ",
    roumaji: "u",
    type: "gojuuon",
  },
  {
    kana: "エ",
    roumaji: "e",
    type: "gojuuon",
  },
  {
    kana: "オ",
    roumaji: "o",
    type: "gojuuon",
  },
  {
    kana: "カ",
    roumaji: "ka",
    type: "gojuuon",
  },
  {
    kana: "キ",
    roumaji: "ki",
    type: "gojuuon",
  },
  {
    kana: "ク",
    roumaji: "ku",
    type: "gojuuon",
  },
  {
    kana: "ケ",
    roumaji: "ke",
    type: "gojuuon",
  },
  {
    kana: "コ",
    roumaji: "ko",
    type: "gojuuon",
  },
  {
    kana: "サ",
    roumaji: "sa",
    type: "gojuuon",
  },
  {
    kana: "シ",
    roumaji: "shi",
    type: "gojuuon",
  },
  {
    kana: "ス",
    roumaji: "su",
    type: "gojuuon",
  },
  {
    kana: "セ",
    roumaji: "se",
    type: "gojuuon",
  },
  {
    kana: "ソ",
    roumaji: "so",
    type: "gojuuon",
  },
  {
    kana: "タ",
    roumaji: "ta",
    type: "gojuuon",
  },
  {
    kana: "チ",
    roumaji: "chi",
    type: "gojuuon",
  },
  {
    kana: "ツ",
    roumaji: "tsu",
    type: "gojuuon",
  },
  {
    kana: "テ",
    roumaji: "te",
    type: "gojuuon",
  },
  {
    kana: "ト",
    roumaji: "to",
    type: "gojuuon",
  },
  {
    kana: "ナ",
    roumaji: "na",
    type: "gojuuon",
  },
  {
    kana: "ニ",
    roumaji: "ni",
    type: "gojuuon",
  },
  {
    kana: "ヌ",
    roumaji: "nu",
    type: "gojuuon",
  },
  {
    kana: "ネ",
    roumaji: "ne",
    type: "gojuuon",
  },
  {
    kana: "ノ",
    roumaji: "no",
    type: "gojuuon",
  },
  {
    kana: "ハ",
    roumaji: "ha",
    type: "gojuuon",
  },
  {
    kana: "ヒ",
    roumaji: "hi",
    type: "gojuuon",
  },
  {
    kana: "フ",
    roumaji: "hu",
    type: "gojuuon",
  },
  {
    kana: "ヘ",
    roumaji: "he",
    type: "gojuuon",
  },
  {
    kana: "ホ",
    roumaji: "ho",
    type: "gojuuon",
  },
  {
    kana: "マ",
    roumaji: "ma",
    type: "gojuuon",
  },
  {
    kana: "ミ",
    roumaji: "mi",
    type: "gojuuon",
  },
  {
    kana: "ム",
    roumaji: "mu",
    type: "gojuuon",
  },
  {
    kana: "メ",
    roumaji: "me",
    type: "gojuuon",
  },
  {
    kana: "モ",
    roumaji: "mo",
    type: "gojuuon",
  },
  {
    kana: "ヤ",
    roumaji: "ya",
    type: "gojuuon",
  },
  {
    kana: "ユ",
    roumaji: "yu",
    type: "gojuuon",
  },
  {
    kana: "ヨ",
    roumaji: "yo",
    type: "gojuuon",
  },
  {
    kana: "ラ",
    roumaji: "ra",
    type: "gojuuon",
  },
  {
    kana: "リ",
    roumaji: "ri",
    type: "gojuuon",
  },
  {
    kana: "ル",
    roumaji: "ru",
    type: "gojuuon",
  },
  {
    kana: "レ",
    roumaji: "re",
    type: "gojuuon",
  },
  {
    kana: "ロ",
    roumaji: "ro",
    type: "gojuuon",
  },
  {
    kana: "ワ",
    roumaji: "wa",
    type: "gojuuon",
  },
  {
    kana: "ヲ",
    roumaji: "wo",
    type: "gojuuon",
  },
  {
    kana: "ン",
    roumaji: "n",
    type: "gojuuon",
  },
  {
    kana: "ガ",
    roumaji: "ga",
    type: "dakuon",
  },
  {
    kana: "ギ",
    roumaji: "gi",
    type: "dakuon",
  },
  {
    kana: "グ",
    roumaji: "gu",
    type: "dakuon",
  },
  {
    kana: "ゲ",
    roumaji: "ge",
    type: "dakuon",
  },
  {
    kana: "ゴ",
    roumaji: "go",
    type: "dakuon",
  },
  {
    kana: "ザ",
    roumaji: "za",
    type: "dakuon",
  },
  {
    kana: "ジ",
    roumaji: "ji",
    type: "dakuon",
  },
  {
    kana: "ズ",
    roumaji: "zu",
    type: "dakuon",
  },
  {
    kana: "ゼ",
    roumaji: "ze",
    type: "dakuon",
  },
  {
    kana: "ゾ",
    roumaji: "zo",
    type: "dakuon",
  },
  {
    kana: "ダ",
    roumaji: "da",
    type: "dakuon",
  },
  {
    kana: "ヂ",
    roumaji: "ji",
    type: "dakuon",
  },
  {
    kana: "ヅ",
    roumaji: "zu",
    type: "dakuon",
  },
  {
    kana: "デ",
    roumaji: "de",
    type: "dakuon",
  },
  {
    kana: "ド",
    roumaji: "do",
    type: "dakuon",
  },
  {
    kana: "バ",
    roumaji: "ba",
    type: "dakuon",
  },
  {
    kana: "ビ",
    roumaji: "bi",
    type: "dakuon",
  },
  {
    kana: "ブ",
    roumaji: "bu",
    type: "dakuon",
  },
  {
    kana: "ベ",
    roumaji: "be",
    type: "dakuon",
  },
  {
    kana: "ボ",
    roumaji: "bo",
    type: "dakuon",
  },
  {
    kana: "パ",
    roumaji: "pa",
    type: "handakuon",
  },
  {
    kana: "ピ",
    roumaji: "pi",
    type: "handakuon",
  },
  {
    kana: "プ",
    roumaji: "pu",
    type: "handakuon",
  },
  {
    kana: "ペ",
    roumaji: "pe",
    type: "handakuon",
  },
  {
    kana: "ポ",
    roumaji: "po",
    type: "handakuon",
  },
  {
    kana: "ッ",
    roumaji: "(pause)",
    type: "sokuon",
  },
  {
    kana: "キャ",
    roumaji: "kya",
    type: "youon",
  },
  {
    kana: "キュ",
    roumaji: "kyu",
    type: "youon",
  },
  {
    kana: "キョ",
    roumaji: "kyo",
    type: "youon",
  },
  {
    kana: "シャ",
    roumaji: "sha",
    type: "youon",
  },
  {
    kana: "シュ",
    roumaji: "shu",
    type: "youon",
  },
  {
    kana: "ショ",
    roumaji: "sho",
    type: "youon",
  },
  {
    kana: "チャ",
    roumaji: "cha",
    type: "youon",
  },
  {
    kana: "チュ",
    roumaji: "chu",
    type: "youon",
  },
  {
    kana: "チョ",
    roumaji: "cho",
    type: "youon",
  },
  {
    kana: "ニャ",
    roumaji: "nya",
    type: "youon",
  },
  {
    kana: "ニュ",
    roumaji: "nyu",
    type: "youon",
  },
  {
    kana: "ニョ",
    roumaji: "nyo",
    type: "youon",
  },
  {
    kana: "ヒャ",
    roumaji: "hya",
    type: "youon",
  },
  {
    kana: "ヒュ",
    roumaji: "hyu",
    type: "youon",
  },
  {
    kana: "ヒョ",
    roumaji: "hyo",
    type: "youon",
  },
  {
    kana: "ミャ",
    roumaji: "mya",
    type: "youon",
  },
  {
    kana: "ミュ",
    roumaji: "myu",
    type: "youon",
  },
  {
    kana: "ミョ",
    roumaji: "myo",
    type: "youon",
  },
  {
    kana: "リャ",
    roumaji: "rya",
    type: "youon",
  },
  {
    kana: "リュ",
    roumaji: "ryu",
    type: "youon",
  },
  {
    kana: "リョ",
    roumaji: "ryo",
    type: "youon",
  },
  {
    kana: "ギャ",
    roumaji: "gya",
    type: "youon",
  },
  {
    kana: "ギュ",
    roumaji: "gyu",
    type: "youon",
  },
  {
    kana: "ギョ",
    roumaji: "gyo",
    type: "youon",
  },
  {
    kana: "ジャ",
    roumaji: "ja",
    type: "youon",
  },
  {
    kana: "ジュ",
    roumaji: "ju",
    type: "youon",
  },
  {
    kana: "ジョ",
    roumaji: "jo",
    type: "youon",
  },
  {
    kana: "ビャ",
    roumaji: "bya",
    type: "youon",
  },
  {
    kana: "ビュ",
    roumaji: "byu",
    type: "youon",
  },
  {
    kana: "ビョ",
    roumaji: "byo",
    type: "youon",
  },
  {
    kana: "ピャ",
    roumaji: "pya",
    type: "youon",
  },
  {
    kana: "ピュ",
    roumaji: "pyu",
    type: "youon",
  },
  {
    kana: "ピョ",
    roumaji: "pyo",
    type: "youon",
  },
  {
    kana: "イィ",
    roumaji: "yi",
    type: "extended",
  },
  {
    kana: "イェ",
    roumaji: "ye",
    type: "extended",
  },
  {
    kana: "ヴァ",
    roumaji: "va",
    type: "extended",
  },
  {
    kana: "ヴィ",
    roumaji: "vi",
    type: "extended",
  },
  {
    kana: "ヴ",
    roumaji: "vu",
    type: "extended",
  },
  {
    kana: "ヴェ",
    roumaji: "ve",
    type: "extended",
  },
  {
    kana: "ヴォ",
    roumaji: "vo",
    type: "extended",
  },
  {
    kana: "ヴャ",
    roumaji: "vya",
    type: "extended",
  },
  {
    kana: "ヴュ",
    roumaji: "vyu",
    type: "extended",
  },
  {
    kana: "ヴョ",
    roumaji: "vyo",
    type: "extended",
  },
  {
    kana: "シェ",
    roumaji: "she",
    type: "extended",
  },
  {
    kana: "ジェ",
    roumaji: "je",
    type: "extended",
  },
  {
    kana: "チェ",
    roumaji: "che",
    type: "extended",
  },
  {
    kana: "スァ",
    roumaji: "swa",
    type: "extended",
  },
  {
    kana: "スィ",
    roumaji: "swi",
    type: "extended",
  },
  {
    kana: "スゥ",
    roumaji: "swu",
    type: "extended",
  },
  {
    kana: "スェ",
    roumaji: "swe",
    type: "extended",
  },
  {
    kana: "スォ",
    roumaji: "swo",
    type: "extended",
  },
  {
    kana: "スャ",
    roumaji: "sya",
    type: "extended",
  },
  {
    kana: "スュ",
    roumaji: "syu",
    type: "extended",
  },
  {
    kana: "スョ",
    roumaji: "syo",
    type: "extended",
  },
  {
    kana: "セィ",
    roumaji: "si",
    type: "extended",
  },
  {
    kana: "ズァ",
    roumaji: "zwa",
    type: "extended",
  },
  {
    kana: "ズィ",
    roumaji: "zwi",
    type: "extended",
  },
  {
    kana: "ズゥ",
    roumaji: "zwu",
    type: "extended",
  },
  {
    kana: "ズェ",
    roumaji: "zwe",
    type: "extended",
  },
  {
    kana: "ズォ",
    roumaji: "zwo",
    type: "extended",
  },
  {
    kana: "ズャ",
    roumaji: "zya",
    type: "extended",
  },
  {
    kana: "ズュ",
    roumaji: "zyu",
    type: "extended",
  },
  {
    kana: "ズョ",
    roumaji: "zyo",
    type: "extended",
  },
  {
    kana: "ゼィ",
    roumaji: "zi",
    type: "extended",
  },
  {
    kana: "ツァ",
    roumaji: "tsa",
    type: "extended",
  },
  {
    kana: "ツィ",
    roumaji: "tsi",
    type: "extended",
  },
  {
    kana: "ツェ",
    roumaji: "tse",
    type: "extended",
  },
  {
    kana: "ツォ",
    roumaji: "tso",
    type: "extended",
  },
  {
    kana: "テァ",
    roumaji: "tha",
    type: "extended",
  },
  {
    kana: "ティ",
    roumaji: "ti",
    type: "extended",
  },
  {
    kana: "テゥ",
    roumaji: "thu",
    type: "extended",
  },
  {
    kana: "テェ",
    roumaji: "tye",
    type: "extended",
  },
  {
    kana: "テォ",
    roumaji: "tho",
    type: "extended",
  },
  {
    kana: "テャ",
    roumaji: "tya",
    type: "extended",
  },
  {
    kana: "テュ",
    roumaji: "tyu",
    type: "extended",
  },
  {
    kana: "テョ",
    roumaji: "tyo",
    type: "extended",
  },
  {
    kana: "デァ",
    roumaji: "dha",
    type: "extended",
  },
  {
    kana: "ディ",
    roumaji: "di",
    type: "extended",
  },
  {
    kana: "デゥ",
    roumaji: "dhu",
    type: "extended",
  },
  {
    kana: "デェ",
    roumaji: "dye",
    type: "extended",
  },
  {
    kana: "デォ",
    roumaji: "dho",
    type: "extended",
  },
  {
    kana: "デャ",
    roumaji: "dya",
    type: "extended",
  },
  {
    kana: "デュ",
    roumaji: "dyu",
    type: "extended",
  },
  {
    kana: "デョ",
    roumaji: "dyo",
    type: "extended",
  },
  {
    kana: "トァ",
    roumaji: "twa",
    type: "extended",
  },
  {
    kana: "トィ",
    roumaji: "twi",
    type: "extended",
  },
  {
    kana: "トゥ",
    roumaji: "tu",
    type: "extended",
  },
  {
    kana: "トェ",
    roumaji: "twe",
    type: "extended",
  },
  {
    kana: "トォ",
    roumaji: "two",
    type: "extended",
  },
  {
    kana: "ドァ",
    roumaji: "dwa",
    type: "extended",
  },
  {
    kana: "ドィ",
    roumaji: "dwi",
    type: "extended",
  },
  {
    kana: "ドゥ",
    roumaji: "du",
    type: "extended",
  },
  {
    kana: "ドェ",
    roumaji: "dwe",
    type: "extended",
  },
  {
    kana: "ドォ",
    roumaji: "dwo",
    type: "extended",
  },
  {
    kana: "ファ",
    roumaji: "fa",
    type: "extended",
  },
  {
    kana: "フィ",
    roumaji: "fi",
    type: "extended",
  },
  {
    kana: "ホゥ",
    roumaji: "hu",
    type: "extended",
  },
  {
    kana: "フェ",
    roumaji: "fe",
    type: "extended",
  },
  {
    kana: "フォ",
    roumaji: "fo",
    type: "extended",
  },
  {
    kana: "フャ",
    roumaji: "fya",
    type: "extended",
  },
  {
    kana: "フュ",
    roumaji: "fyu",
    type: "extended",
  },
  {
    kana: "フョ",
    roumaji: "fyo",
    type: "extended",
  },
  {
    kana: "リィ",
    roumaji: "ryi",
    type: "extended",
  },
  {
    kana: "リェ",
    roumaji: "rye",
    type: "extended",
  },
  {
    kana: "ウァ",
    roumaji: "(wa)",
    type: "extended",
  },
  {
    kana: "ウィ",
    roumaji: "wi",
    type: "extended",
  },
  {
    kana: "ウゥ",
    roumaji: "(wu)",
    type: "extended",
  },
  {
    kana: "ウェ",
    roumaji: "we",
    type: "extended",
  },
  {
    kana: "ウォ",
    roumaji: "wo",
    type: "extended",
  },
  {
    kana: "ウャ",
    roumaji: "wya",
    type: "extended",
  },
  {
    kana: "ウュ",
    roumaji: "wyu",
    type: "extended",
  },
  {
    kana: "ウョ",
    roumaji: "wyo",
    type: "extended",
  },
  {
    kana: "クァ",
    roumaji: "kwa",
    type: "extended",
  },
  {
    kana: "クィ",
    roumaji: "kwi",
    type: "extended",
  },
  {
    kana: "クゥ",
    roumaji: "kwu",
    type: "extended",
  },
  {
    kana: "クェ",
    roumaji: "kwe",
    type: "extended",
  },
  {
    kana: "クォ",
    roumaji: "kwo",
    type: "extended",
  },
  {
    kana: "グァ",
    roumaji: "gwa",
    type: "extended",
  },
  {
    kana: "グィ",
    roumaji: "gwi",
    type: "extended",
  },
  {
    kana: "グゥ",
    roumaji: "gwu",
    type: "extended",
  },
  {
    kana: "グェ",
    roumaji: "gwe",
    type: "extended",
  },
  {
    kana: "グォ",
    roumaji: "gwo",
    type: "extended",
  },
  {
    kana: "ムァ",
    roumaji: "mwa",
    type: "extended",
  },
  {
    kana: "ムィ",
    roumaji: "mwi",
    type: "extended",
  },
  {
    kana: "ムゥ",
    roumaji: "mwu",
    type: "extended",
  },
  {
    kana: "ムェ",
    roumaji: "mwe",
    type: "extended",
  },
  {
    kana: "ムォ",
    roumaji: "mwo",
    type: "extended",
  },
];

const kanaToRoumajiMap = new Map();
for (const { kana, roumaji } of KATAKANAS) {
  kanaToRoumajiMap.set(kana, roumaji);
}

const possibleSecondChars = new Set([
  "ァ",
  "ィ",
  "ゥ",
  "ェ",
  "ォ",
  "ャ",
  "ュ",
  "ョ",
  "ヮ",
  "ヵ",
  "ヶ",
]);

function fullWidthToHalfWidth(str: string) {
  return str.replace(/[！-～]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
  });
}

export async function annotateMecab(str: string) {
  return (await tokenize(str))
    .filter((token) => token.feature.pos !== "BOS/EOS")
    .map((token) => {
      const prons = (token.feature.pronunciation ?? token.surface)
        // split by characters, however merge the second character if it's a possible second character
        .split("")
        .reduce((acc, char) => {
          if (possibleSecondChars.has(char)) {
            acc[acc.length - 1] += char;
          } else {
            acc.push(char);
          }
          return acc;
        }, [] as string[]);

      // convert to roumaji
      const roumajis = prons
        .map((kana) => {
          if (kana === "ー") return "";
          if (kana === "(pause)") return "";
          return kanaToRoumajiMap.get(kana) || kana;
        })
        .map((roumaji) => {
          fullWidthToHalfWidth(roumaji);
        });

      return roumajis.join("");
    })
    .join("");
}
