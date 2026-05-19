import { getDxdataSongCatalog, normalizeMuNetRows, type ProviderMusicIdMap } from '@gekichumai/maimai-domain'
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import { z } from 'zod'
import MdiEarthArrowDown from '~icons/mdi/earth-arrow-down'
import { useWebHaptics } from 'web-haptics/react'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { importResultToPlayEntries } from './importResultToPlayEntries'

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
  const haptic = useWebHaptics()
  const appVersion = useAppContextDXDataVersion()

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
              const musicIdMap = musicIdMapJson.default as ProviderMusicIdMap

              const rows = muNetData.userMusicDetailList.map((musicDetail) => ({
                musicId: musicDetail.musicId,
                level: musicDetail.level,
                achievement: musicDetail.achievement,
              }))
              const importResult = normalizeMuNetRows(getDxdataSongCatalog(appVersion), rows, musicIdMap)
              const entries = importResultToPlayEntries(importResult)
              for (const warning of importResult.warnings) {
                console.warn('[ImportFromMuNetButtonListItem]', warning.message, warning.row)
              }

              modifyEntries.set(entries)
              haptic.trigger('success')
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