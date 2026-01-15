import { canonicalIdFromParts } from '@/songs'
import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import { z } from 'zod'
import MdiEarthArrowDown from '~icons/mdi/earth-arrow-down'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

const MuNetUserMusicDetailSchema = z.object({
  musicId: z.number(),
  level: z.number(),
  achievement: z.number(),
})

const MuNetExportSchema = z.object({
  userMusicDetailList: z.array(MuNetUserMusicDetailSchema),
})

export const ImportFromMuNetButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const difficulty = ['basic', 'advanced', 'expert', 'master', 'remaster']

  const parseAchievement = (achievement: number): number => {
    return Number.isNaN(achievement) ? 0 : achievement / 10000
  }

  return (
    <MenuItem
      onClick={() => {
        onClose()

        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json'
        input.onchange = (event) => {
          const element = event.target as HTMLInputElement
          if (!element) return

          const file = element?.files ? element?.files[0] : undefined
          if (!file) return

          const reader = new FileReader()
          reader.onload = async (event) => {
            const data = event.target?.result
            if (!data) return
            if (typeof data !== 'string') return

            try {
              const json = JSON.parse(data)
              const parseResult = MuNetExportSchema.safeParse(json)

              if (!parseResult.success) {
                console.error('Zod Validation Error:', parseResult.error)
                throw new Error('Invalid MuNET JSON structure')
              }

              const muNetData = parseResult.data

              const musicIdMapJson = await import('@/assets/music-id-map.json')
              const musicIdMap: { [key: string]: { name: string; ver: string } } = musicIdMapJson.default

              const entries: PlayEntry[] = []
              if (muNetData.userMusicDetailList.length > 0) {
                for (const musicDetail of muNetData.userMusicDetailList) {
                  const musicId = musicDetail.musicId
                  const song = musicIdMap[String(musicId)]

                  if (!song) {
                    // console.warn(`Song not found for ID: ${musicId}`)
                    continue
                  }

                  // ver: "24000" might need to be filtered out?
                  // In AquaDX: if (!song || song.ver === '24000') continue
                  // Let's assume similar logic
                  if (song.ver === '24000') {
                    continue
                  }

                  // Determine chart type (Standard vs DX)
                  // Maimai logic: ID > 10000 usually implies DX, but let's check exact logic
                  // So it works if musicId is number.
                  const isDx = musicId >= 10000

                  // Difficulty mapping
                  // musicDetail.level is 0-4
                  const diffName = difficulty[musicDetail.level]
                  if (!diffName) {
                    console.warn(`Unknown level: ${musicDetail.level} for song ${musicId}`)
                    continue
                  }

                  const musicType = isDx ? 'dx' : 'std'
                  const musicName = canonicalIdFromParts(song.name, musicType as TypeEnum, diffName as DifficultyEnum)
                  entries.push({
                    sheetId: musicName,
                    achievementRate: parseAchievement(musicDetail.achievement),
                  })
                }
              }
              modifyEntries.set(entries)
              toast.success(t('rating-calculator:io.import.mu-net.success', { count: entries.length }))
            } catch (error) {
              console.error(error)
              toast.error(
                t('rating-calculator:io.import.mu-net.error', {
                  error: error instanceof Error ? error.message : 'Unknown error',
                }),
              )
            }
          }
          reader.readAsText(file)
        }
        input.click()
      }}
    >
      <ListItemIcon>
        <MdiEarthArrowDown />
      </ListItemIcon>
      <ListItemText>{t('rating-calculator:io.import.mu-net.title')}</ListItemText>
    </MenuItem>
  )
}
