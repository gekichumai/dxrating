import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { execSync } from 'child_process'
import clsx from 'clsx'
import fs from 'fs/promises'
import { FC, PropsWithChildren } from 'react'
import { ASSETS_BASE_DIR, Region, RenderData } from '.'

interface VersionTheme {
  background: string
  logo: string
  favicon: string
  accentColor: string
  backgroundSize: [number, number]
}

export const VERSION_THEME: Record<string, VersionTheme> = {
  [VersionEnum.FESTiVALPLUS]: {
    background: '/images/background/festival-plus.jpg',
    logo: '/images/version-logo/festival-plus.png',
    favicon: '/favicon/festival-plus-1024x.jpg',
    accentColor: '#c8a8f9',
    backgroundSize: [2200, 2400],
  },
  [VersionEnum.BUDDiES]: {
    background: '/images/background/buddies.jpg',
    logo: '/images/version-logo/buddies.png',
    favicon: '/favicon/buddies-1024x.jpg',
    accentColor: '#FAAE29',
    backgroundSize: [2000, 2400],
  },
  [VersionEnum.BUDDiESPLUS]: {
    background: '/images/background/buddies.jpg',
    logo: '/images/version-logo/buddies-plus.png',
    favicon: '/favicon/buddies-1024x.jpg',
    accentColor: '#FAAE29',
    backgroundSize: [2000, 2400],
  },
  [VersionEnum.PRiSM]: {
    background: '/images/background/prism.jpg',
    logo: '/images/version-logo/prism.png',
    favicon: '/favicon/prism-1024x.jpg',
    accentColor: '#6368C7',
    backgroundSize: [2000, 2400],
  },
}

const DIFFICULTIES: Record<DifficultyEnum, { title: string; color: string; inverted?: boolean }> = {
  [DifficultyEnum.Basic]: {
    title: 'BASIC',
    color: '#22bb5b',
  },
  [DifficultyEnum.Advanced]: {
    title: 'ADVANCED',
    color: '#fb9c2d',
  },
  [DifficultyEnum.Expert]: {
    title: 'EXPERT',
    color: '#f64861',
  },
  [DifficultyEnum.Master]: {
    title: 'MASTER',
    color: '#9e45e2',
  },
  [DifficultyEnum.ReMaster]: {
    title: 'Re:MASTER',
    color: '#951BEF',
    inverted: true,
  },
}

const estimateTitleCharacterLength = (title: string) => {
  // assume english characters as 1 and japanese characters as 2
  const englishCount = (title.match(/[A-Za-z]/g) || []).length
  const nonEnglishCount = title.length - englishCount
  return englishCount + nonEnglishCount * 2
}

const renderCell = async (entry: RenderData | undefined, i: number) => {
  if (!entry) {
    return (
      <div key="empty" tw="w-1/5 p-[4px] flex h-[116px]">
        <div tw="h-full w-full rounded-lg" />
      </div>
    )
  }

  const [coverImage, typeImage, accuracyImage, syncImage] = await Promise.all([
    fs.readFile(
      ASSETS_BASE_DIR + '/images/cover/v2/' + entry.sheet.imageName.replace('.png', '.webp')
    ),
    fs.readFile(
      ASSETS_BASE_DIR +
        `/images/type_${entry.sheet.type === TypeEnum.STD ? 'sd' : entry.sheet.type}.png`
    ),
    fs.readFile(
      ASSETS_BASE_DIR + `/images/play-achievement/${entry.achievementAccuracy ?? 'blank'}.png`
    ),
    fs.readFile(
      ASSETS_BASE_DIR + `/images/play-achievement/${entry.achievementSync ?? 'blank'}.png`
    ),
  ])

  const theme = DIFFICULTIES[entry.sheet.difficulty]

  const backgroundColor = theme.inverted ? '#EBCFFF' : theme.color
  const foregroundColor = theme.inverted ? theme.color : '#fff'
  const shadowColor = theme.inverted ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)'

  const starImageFile = (() => {
    if (!entry.dxScore) return null
    switch (entry.dxScore.stars) {
      case 5:
        return ASSETS_BASE_DIR + '/images/dxscore-star/3.png'
      case 4:
      case 3:
        return ASSETS_BASE_DIR + '/images/dxscore-star/2.png'
      case 2:
      case 1:
        return ASSETS_BASE_DIR + '/images/dxscore-star/1.png'
    }
  })()
  const starImage = starImageFile && (await fs.readFile(starImageFile)).buffer

  return (
    <div key={entry.sheet.id} tw="w-1/5 p-[4px] flex h-[116px]">
      <div
        tw="h-full w-full rounded-lg flex items-start justify-start p-[10px] relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${backgroundColor}, ${backgroundColor} 65%, ${backgroundColor}88)`,
          color: foregroundColor,
          boxShadow: '0 0 3px 0 rgba(0,0,0,0.5)',
        }}
      >
        <img
          // @ts-expect-error
          src={coverImage.buffer}
          alt={entry.sheet.imageName}
          tw="h-[108px] w-[108px] absolute top-0 right-[-1px]"
          style={{
            maskImage: `linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 10%, rgba(255,255,255,1) 100%)`,
            maskRepeat: 'no-repeat',
          }}
        />
        <div tw="flex flex-col items-start justify-between relative h-full mr-[54px]">
          <span
            tw="overflow-hidden font-bold w-[180px] h-[19px]"
            lang="ja"
            style={{
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: '0 0 2px ' + shadowColor,
              lineHeight: '15px',
              fontSize: (() => {
                const length = estimateTitleCharacterLength(entry.sheet.title)
                if (length <= 14) return '15px'
                if (length <= 17) return '14.5px'
                if (length <= 20) return '14px'
                if (length <= 23) return '13.5px'
                if (length <= 26) return '13px'
                return '12.5px'
              })(),
            }}
          >
            {entry.sheet.title}
          </span>

          <div tw="text-sm leading-none flex items-center">
            <img
              // @ts-expect-error
              src={typeImage.buffer}
              alt=""
              tw="h-[20px] mr-1"
              style={{ filter: 'saturate(0.75) brightness(0.95) contrast(0.9)' }}
            />
            <span
              tw="text-[10px] bg-black/35 rounded-full px-[6px] py-[2px] mb-[2px] leading-none mr-1 flex items-center text-white"
              style={{
                boxShadow: '0 0 0 1px rgba(0,0,0,0.42)',
              }}
            >
              <span tw="opacity-80">{DIFFICULTIES[entry.sheet.difficulty].title}</span>

              <span tw="font-bold ml-0.5">{entry.sheet.internalLevelValue.toFixed(1)}</span>
            </span>
          </div>

          <div tw="flex items-center text-[13px] leading-none font-bold">
            <span tw="text-[12px] leading-none bg-black/50 rounded-full leading-none px-[6px] py-[2px] font-bold text-white">
              {entry.rating.ratingAwardValue}
            </span>

            <span tw="text-sm leading-none ml-1" style={{ textShadow: '0 0 2px ' + shadowColor }}>
              {entry.achievementRate.toFixed(4)}%
            </span>

            <span
              tw="leading-none font-normal ml-1 opacity-80 flex items-center"
              style={{ textShadow: '0 0 2px ' + shadowColor }}
            >
              <span tw="text-sm leading-none">
                {entry.rating.rank?.replace('p', '')?.toUpperCase()}
              </span>
              {entry.rating.rank?.includes('p') && <span tw="text-[15px] leading-none">+</span>}
            </span>
          </div>

          <div tw="flex items-center text-[13px] leading-none font-bold">
            {(entry.playCount || entry.allPerfectPlusCount) && (
              <span tw="leading-none bg-black/50 rounded-full leading-none px-[6px] py-[2px] text-white mr-1 flex items-center">
                {entry.playCount && (
                  <div tw="flex items-center">
                    <span tw="opacity-40 text-[9px] tracking-tighter">PC</span>
                    <span tw="font-bold ml-0.5 text-[12px]">{entry.playCount}</span>
                  </div>
                )}
                {entry.playCount && entry.allPerfectPlusCount && (
                  <span tw="w-[1px] h-[10px] bg-white/40 ml-0.5 mr-[3px]" />
                )}
                {entry.allPerfectPlusCount && (
                  <div tw="flex items-center">
                    <span tw="opacity-40 text-[7px] tracking-tighter">AP+</span>
                    <span tw="font-bold ml-0.5 text-[12px]">{entry.allPerfectPlusCount}</span>
                  </div>
                )}
              </span>
            )}

            <img
              // @ts-expect-error
              src={accuracyImage.buffer}
              alt=""
              tw={`h-[22px] w-[22px] -ml-0.5 ${entry.achievementAccuracy ? '' : 'opacity-80'}`}
            />

            <img
              // @ts-expect-error
              src={syncImage.buffer}
              alt=""
              tw={`h-[22px] w-[22px] ${entry.achievementSync ? '' : 'opacity-80'}`}
            />

            {entry.dxScore && (
              <div tw="flex flex-col items-start leading-none leading-none ml-1 relative">
                <span tw="text-[9px] leading-none" style={{ textShadow: `0 0 1px ${shadowColor}` }}>
                  {entry.dxScore.achieved} / {entry.dxScore.total}
                </span>

                <div tw="flex items-center -mt-[1px]">
                  {starImage ? (
                    Array.from({ length: entry.dxScore.stars }).map((_, i) => (
                      // @ts-expect-error
                      <img key={i} src={starImage} alt="" tw="h-[12px] w-[12px] -ml-0.5" />
                    ))
                  ) : (
                    <div tw="h-[12px] w-[12px] -ml-0.5" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div tw="absolute bottom-1 right-1 text-[9px] font-bold leading-none flex rounded-md justify-center w-[24px] py-[2px] bg-black/50 text-white">
          {'#' + (i + 1)}
        </div>
      </div>
    </div>
  )
}

const padArray = <T,>(arr: T[], len: number, fill?: T): (T | undefined)[] => {
  return arr.concat(Array(len).fill(fill)).slice(0, len)
}

const gitVersion = execSync('git rev-parse HEAD').toString().trim()

const FactItem = ({
  value,
  label,
  size = 'sm',
  tw,
}: {
  value: string
  label: string
  size?: 'sm' | 'lg'
  tw?: string
}) => {
  return (
    <div tw={clsx('flex flex-col items-start justify-center', tw)}>
      <div
        tw={clsx('leading-none font-semibold', size === 'sm' ? 'text-2xl mb-[2px]' : 'text-3xl')}
      >
        {value}
      </div>
      <div tw={clsx('leading-none', size === 'sm' ? 'text-sm' : 'text-base')}>{label}</div>
    </div>
  )
}

export const BottomLabel: FC<
  PropsWithChildren<{
    first?: boolean
  }>
> = ({ first, children }) => {
  return (
    <div
      tw={clsx(
        'flex items-center justify-center bg-black/40 rounded-t-lg text-[12px] text-white px-3 pt-1 pb-2 font-bold leading-none',
        !first && 'ml-1'
      )}
    >
      {children}
    </div>
  )
}

export const renderContent = async ({
  data,
  version,
  region,
}: {
  data: {
    b15: RenderData[]
    b35: RenderData[]
  }
  version: VersionEnum
  region?: Region
}) => {
  const theme = VERSION_THEME[version]

  const background = (await fs.readFile(ASSETS_BASE_DIR + theme.background)).buffer

  const b50Sum = [...data.b15, ...data.b35].reduce(
    (acc, cur) => acc + cur.rating.ratingAwardValue,
    0
  )

  const b15Sum = data.b15.reduce((acc, cur) => acc + cur.rating.ratingAwardValue, 0)
  const b35Sum = data.b35.reduce((acc, cur) => acc + cur.rating.ratingAwardValue, 0)

  const formattedRegionSuffix = region
    ? region === '_generic'
      ? ' (Generic)'
      : ` (${region.toUpperCase()})`
    : ''

  return (
    <div tw="font-sans text-lg leading-none flex h-full">
      <img
        tw="absolute inset-0 w-full h-full"
        // @ts-expect-error
        src={background}
        alt=""
        style={{
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      <div tw="w-full h-full px-1 pt-1 flex flex-wrap">
        <div tw="h-[100px] w-full flex pt-[2px] pb-1 px-[4px]">
          <div tw="flex items-end justify-start py-4 px-6 rounded-lg w-full bg-black/80 text-white h-full">
            <FactItem value={b50Sum.toFixed(0)} label="Total" size="lg" tw="mr-6" />

            <FactItem value={b15Sum.toFixed(0)} label="B15" tw="mr-4" />
            <FactItem value={b35Sum.toFixed(0)} label="B35" />
          </div>
        </div>

        {await Promise.all(padArray(data.b35, 35).map(renderCell))}

        <div tw="w-full h-[1px] bg-black/20 my-[6px]" />

        {await Promise.all(padArray(data.b15, 15).map(renderCell))}

        <div tw="w-full flex items-center justify-center h-[27px] pt-1">
          <BottomLabel first>Rendered by DXRating.net</BottomLabel>

          <BottomLabel>Renderer Revision {gitVersion.slice(0, 7)}</BottomLabel>

          <BottomLabel>
            ver. {version}
            {formattedRegionSuffix}
          </BottomLabel>
        </div>
      </div>
    </div>
  )
}
