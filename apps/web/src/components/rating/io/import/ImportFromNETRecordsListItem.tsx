import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import IconMdiConnection from '~icons/mdi/connection'
import { ImportRegionSupportTag } from './ImportRegionSupportTag'
import { useMaimaiNetStatus } from './useMaimaiNetStatus'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
  const locale = useLocale()
  // The menu mounts this only while it is open
  const maintenance = useMaimaiNetStatus(true)
  return (
    <MenuItem className="max-w-xl" onClick={onSelect}>
      <ListItemIcon>
        <IconMdiConnection />
      </ListItemIcon>
      <ListItemText
        primary={m.ratingCalculator_io_import_netRecords_title({}, { locale })}
        secondary={
          <span className="flex gap-1">
            <ImportRegionSupportTag region="intl" maintenance={maintenance.intl} />
            <ImportRegionSupportTag region="jp" maintenance={maintenance.jp} />
          </span>
        }
      />
    </MenuItem>
  )
}