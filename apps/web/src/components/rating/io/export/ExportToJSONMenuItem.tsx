import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconMdiFile from '~icons/mdi/file'
import { useRatingCalculatorContext } from '../../../../models/context/RatingCalculatorContext'
import { type RatingCalculatorEntry, useRatingEntries } from '../../useRatingEntries'

const saveAsJsonFile = (data: string) => {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const name = `dxrating.export-${new Date().toISOString()}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)

  toast.success(`Exported as ${name}`)
}

export const ExportToJSONMenuItem: FC = () => {
  const { entries } = useRatingCalculatorContext()
  const { b15Entries, b35Entries } = useRatingEntries()
  const { t } = useTranslation(['rating-calculator'])

  return (
    <>
      <MenuItem
        onClick={() => {
          saveAsJsonFile(JSON.stringify(entries))
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>{t('rating-calculator:io.export.to-json.all-records')}</ListItemText>
      </MenuItem>

      <MenuItem
        onClick={() => {
          const preprocess = (entry: RatingCalculatorEntry) => ({
            sheetId: entry.sheetId,
            achievementRate: entry.achievementRate,
          })

          const data = JSON.stringify([...b35Entries.map(preprocess), ...b15Entries.map(preprocess)])
          saveAsJsonFile(data)
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>{t('rating-calculator:io.export.to-json.b50-records')}</ListItemText>
      </MenuItem>
    </>
  )
}
