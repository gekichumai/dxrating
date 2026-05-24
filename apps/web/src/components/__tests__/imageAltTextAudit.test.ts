import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const weakAltPatterns: {
  file: string
  pattern: RegExp
  replacement: string
}[] = [
  {
    file: 'src/routes/__root.tsx',
    pattern: /alt="background"/,
    replacement: 'empty alt text for decorative background art',
  },
  {
    file: 'src/components/rating/io/export/RenderToOneShotImageButton.tsx',
    pattern: /alt="OneShot"/,
    replacement: 'a localized preview description',
  },
  {
    file: 'src/components/global/site-meta/About.tsx',
    pattern: /alt="Version"/,
    replacement: 'a localized version logo description',
  },
  {
    file: 'src/components/global/preferences/UserChip.tsx',
    pattern: /alt="Profile"/,
    replacement: 'empty alt text when the surrounding control already names the profile action',
  },
  {
    file: 'src/components/rating/io/import/ImportFromAquaSQLiteListItem.tsx',
    pattern: /alt=\{`Icon \$\{/,
    replacement: 'a localized user icon description',
  },
  {
    file: 'src/components/sheet/SheetListItem.tsx',
    pattern: /alt=\{name\}/,
    replacement: 'the song title as cover-art alt text',
  },
  {
    file: 'src/components/sheet/SheetDialogContentHeader.tsx',
    pattern: /alt=\{sheet\.imageName\}/,
    replacement: 'the song title as cover-art alt text',
  },
  {
    file: 'src/components/sheet/SheetDialogContent.tsx',
    pattern: /alt=\{direction\}|alt=\{VERSION_SLUG_MAP\.get\(version\)\}/,
    replacement: 'localized internal-level delta and version-logo descriptions',
  },
  {
    file: 'src/components/song/SongHeader.tsx',
    pattern: /alt=\{song\.title\}/,
    replacement: 'the song title as cover-art alt text',
  },
  {
    file: 'src/components/song/SongSheetContent.tsx',
    pattern: /alt=\{direction\}|alt=\{VERSION_SLUG_MAP\.get\(version\)\}/,
    replacement: 'localized internal-level delta and version-logo descriptions',
  },
]

describe('image alt text audit', () => {
  it.each(weakAltPatterns)('$file does not use weak alt text', ({ file, pattern, replacement }) => {
    const source = readFileSync(file, 'utf8')

    expect(source, `${file} should use ${replacement}`).not.toMatch(pattern)
  })
})