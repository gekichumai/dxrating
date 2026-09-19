import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import { useTranslation } from 'react-i18next'
import IconMdiConnection from '~icons/mdi/connection'
import { ImportRegionSupportTag } from './ImportRegionSupportTag'

interface AchievementRecord {
  sheet: {
    songId: string
    type: 'standard' | 'dx' | 'utage'
    difficulty: 'basic' | 'advanced' | 'expert' | 'master' | 'remaster' | 'utage'
  }
  achievement: {
    rate: number
    dxScore: {
      achieved: number
      total: number
    }
    flags: string[]
  }
}

export type MusicRecord = AchievementRecord
export type RecentRecord = AchievementRecord & {
  play: {
    track: number
    timestamp?: string
  }
}

export const ImportFromNETRecordsListItem = ({ onSelect }: { onSelect: () => void }) => {
  const { t } = useTranslation(['rating-calculator'])
  return (
    <MenuItem className="max-w-xl" onClick={onSelect}>
      <ListItemIcon>
        <IconMdiConnection />
      </ListItemIcon>
      <ListItemText
        primary={t('rating-calculator:io.import.net-records.title')}
        secondary={
          <div className="flex gap-1">
            <ImportRegionSupportTag region="intl" />
            <ImportRegionSupportTag region="jp" />
          </div>
        }
      />
    </MenuItem>
  )
}