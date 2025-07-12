import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import MdiEarthArrowDown from '~icons/mdi/earth-arrow-down'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export const ImportFromAquaDxButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const difficulty = ['basic', 'expert', 'master', 'remaster']

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

            const musicIdMapJson = await import('@/assets/music-id-map.json')
            const musicIdMap: { [key: string]: { name: string; ver: string } } = musicIdMapJson.default

            const aquaExportData = JSON.parse(data)
            const entries: PlayEntry[] = []
            if (Array.isArray(aquaExportData?.userMusicDetailList) && aquaExportData.userMusicDetailList.length > 0) {
              for (const musicDetail of aquaExportData.userMusicDetailList) {
                const musicId = musicDetail.musicId
                const song = musicIdMap[musicId]
                if (!song || song.ver === '24000') {
                  continue
                }
                const type = musicId > '10000' ? '__dxrt__dx__dxrt__' : '__dxrt__std__dxrt__'
                const musicName = `${song.name}${type}${difficulty[musicDetail.level - 1]}`
                entries.push({
                  sheetId: musicName,
                  achievementRate: parseAchievement(musicDetail.achievement),
                })
              }
            }
            modifyEntries.set(entries)
            toast.success(t('rating-calculator:io.import.aqua-dx.success', { count: entries.length }))
          }
          reader.readAsText(file)
        }
        input.click()
      }}
    >
      <ListItemIcon>
        <MdiEarthArrowDown />
      </ListItemIcon>
      <ListItemText>{t('rating-calculator:io.import.aqua-dx.title')}</ListItemText>
    </MenuItem>
  )
}
