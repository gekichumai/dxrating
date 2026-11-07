import { useSongCatalogLoader } from '@/catalog/CatalogContext'
import { loadLegacySongIds } from '@/catalog/legacySongIds'
import { normalizeMuNetRows, type ProviderMusicIdMap } from '@gekichumai/maimai-domain'
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { z } from 'zod'
import MdiEarthArrowDown from '~icons/mdi/earth-arrow-down'
import { useWebHaptics } from 'web-haptics/react'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { createRatingImportTracker } from '@/lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const MuNetUserMusicDetailSchema = z.object({
  musicId: z.number(),
  level: z.number(),
  achievement: z.number(),
})

const MuNetExportSchema = z.object({
  userMusicDetailList: z.array(MuNetUserMusicDetailSchema),
})

export const ImportFromMuNetButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const locale = useLocale()
  const repository = useScoreRepository()
  const haptic = useWebHaptics()
  const loadCatalog = useSongCatalogLoader()

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

            const analytics = createRatingImportTracker('mu_net')
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
              const importResult = normalizeMuNetRows(await loadCatalog(), rows, musicIdMap, await loadLegacySongIds())
              const entries = importResultToPlayEntries(importResult)
              for (const warning of importResult.warnings) {
                console.warn('[ImportFromMuNetButtonListItem]', warning.message, warning.row)
              }

              const { applied } = await reviewAndApplyImport(
                repository,
                entries,
                { source: 'mu-net', mode: 'replace' },
                { trigger: 'manual' },
              )
              if (!applied) {
                analytics.failed('cancelled_by_user')
                toast(m.ratingCalculator_io_import_review_cancelled({}, { locale }), { id: 'import-review-cancelled' })
                return
              }
              analytics.succeeded(entries.length, importResult.warnings.length)
              haptic.trigger('success')
              toast.success(m.ratingCalculator_io_import_muNet_success({ count: entries.length }, { locale }))
            } catch (error) {
              analytics.failed('invalid_file')
              console.error(error)
              toast.error(
                m.ratingCalculator_io_import_muNet_error(
                  {
                    error: error instanceof Error ? error.message : 'Unknown error',
                  },
                  { locale },
                ),
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
      <ListItemText>{m.ratingCalculator_io_import_muNet_title({}, { locale })}</ListItemText>
    </MenuItem>
  )
}