import { ImportRegionSupportTag } from '@/components/rating/io/import/ImportRegionSupportTag'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TypeEnum } from '@gekichumai/dxdata'
import { DifficultyEnum } from '@gekichumai/dxdata'
import { Button, CircularProgress, ListItemIcon, ListItemText, MenuItem, TextField } from '@mui/material'
import { type FC, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'react-use'
import type { ListActions } from 'react-use/lib/useList'
import CarbonCloud from '~icons/carbon/cloud'
import AlertIcon from '~icons/material-symbols/warning'
import { canonicalIdFromParts, type FlattenedSheet, useSheets } from '../../../../songs'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

interface LxnsProfile {
  friendCode?: string
  qq?: string
}

interface LxnsPlayerResponse {
  friend_code: string
  nickname: string
  rating: number
  // ... other fields
}

interface LxnsScoreResponse {
  achievements: number
  ds: number
  fc: string
  fs: string
  level: string
  level_index: number
  level_label: string
  ra: number
  rate: string
  song_id: number
  title: string
  type: string
  // ... other fields
}

const difficultyMap: Record<number, DifficultyEnum> = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

// Extend the PlayEntryProviderConfig interface
declare module '../../RatingCalculatorAddEntryForm' {
  interface PlayEntryProviderConfig {
    lxns?: {
      friendCode: string
    }
  }
}

const fetchLxnsData = async (
  sheets: FlattenedSheet[],
  lxnsProfile: LxnsProfile | null,
  modifyEntries: ListActions<PlayEntry>,
) => {
  const { t } = useTranslation(['rating-calculator'])
  const toastId = toast.loading(t('rating-calculator:io.import.lxns.loading'))
  try {
    let friendCode: string | undefined = lxnsProfile?.friendCode

    // If QQ is provided but not friend code, fetch the friend code first
    if (!friendCode && lxnsProfile?.qq) {
      const playerResponse = await fetch(`/api/functions/fetch-lxns-data/player/qq/${lxnsProfile.qq}`)

      if (!playerResponse.ok) {
        throw new Error(`Failed to fetch player data: ${playerResponse.status}: ${await playerResponse.text()}`)
      }

      const playerData = (await playerResponse.json()) as LxnsPlayerResponse
      friendCode = playerData.friend_code
    }

    if (!friendCode) {
      throw new Error('No friend code available')
    }

    // Fetch scores using the friend code
    const scoresResponse = await fetch(`/api/functions/fetch-lxns-data/player/${friendCode}/scores`)

    if (!scoresResponse.ok) {
      throw new Error(`Failed to fetch scores: ${scoresResponse.status}: ${await scoresResponse.text()}`)
    }

    const scoresData = (await scoresResponse.json()) as LxnsScoreResponse[]

    const entries: PlayEntry[] = scoresData.map((score) => {
      return {
        sheetId: canonicalIdFromParts(
          score.title,
          (score.type.toLowerCase() === 'sd' ? 'std' : score.type.toLowerCase()) as TypeEnum,
          difficultyMap[score.level_index],
        ),
        achievementRate: score.achievements,
        providerConfig: {
          lxns: {
            friendCode,
          },
        },
      }
    })

    modifyEntries.set(
      entries.filter((entry) => {
        const found = sheets.find((sheet) => sheet.id === entry.sheetId)
        if (!found) {
          console.warn(`No sheet found for ${entry.sheetId}`)
        }
        return found
      }),
    )

    toast.success(t('rating-calculator:io.import.lxns.success', { count: entries.length }), {
      id: toastId,
    })
  } catch (error) {
    console.error('There was a problem with the fetch operation:', error)
    toast.error(t('rating-calculator:io.import.lxns.error', { error: formatErrorMessage(error) }), {
      id: toastId,
    })
  }
}

export const ImportLxnsDialogContent: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { data: sheets } = useSheets({ acceptsPartialData: true })
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation(['rating-calculator'])
  const [lxnsConfig, setLxnsConfig] = useLocalStorage<LxnsProfile | null>('lxns-profile', null)

  const invalidReason = useMemo(() => {
    if (!lxnsConfig) return 'missing' as const
    if (!lxnsConfig.friendCode && !lxnsConfig.qq) return 'missing' as const
    if (lxnsConfig.friendCode && lxnsConfig.qq) return 'excessive' as const
    return null
  }, [lxnsConfig])

  return (
    <DialogContent className="flex flex-col items-start gap-2">
      <DialogHeader className="mb-2">
        <DialogTitle className="flex flex-col items-start gap-2">
          <div>{t('rating-calculator:io.import.lxns.title')}</div>
          <div className="text-sm text-zinc-5">{t('rating-calculator:io.import.lxns.description')}</div>
        </DialogTitle>
      </DialogHeader>

      <Alert variant="destructive" className="font-bold">
        <AlertIcon className="h-4 w-4" />
        <AlertTitle>{t('rating-calculator:io.import.lxns.warning.title')}</AlertTitle>
        <AlertDescription>{t('rating-calculator:io.import.lxns.warning.description')}</AlertDescription>
      </Alert>

      <TextField
        fullWidth
        label={t('settings:import-provider.lxns.friend-code')}
        value={lxnsConfig?.friendCode ?? ''}
        onChange={(e) => {
          setLxnsConfig({
            ...lxnsConfig,
            friendCode: e.target.value,
          })
        }}
        data-attr="lxns-profile.friend-code"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
      />

      <div className="w-full flex items-center gap-2 select-none">
        <div className="h-px w-full bg-zinc-200" />
        <span className="text-sm text-zinc-5">{t('rating-calculator:io.import.lxns.or')}</span>
        <div className="h-px w-full bg-zinc-200" />
      </div>

      <TextField
        fullWidth
        label={t('settings:import-provider.lxns.qq')}
        value={lxnsConfig?.qq ?? ''}
        onChange={(e) => {
          setLxnsConfig({
            ...lxnsConfig,
            qq: e.target.value,
          })
        }}
        data-attr="lxns-profile.qq"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        className="mb-2"
      />

      {busy && (
        <div className="w-full flex justify-center items-center py-4 bg-white/70 rounded absolute inset-0 z-100 backdrop-blur-sm">
          <CircularProgress size="1rem" className="text-zinc-5" />
        </div>
      )}

      <DialogFooter className="flex items-center justify-end w-full">
        <Button onClick={onClose}>{t('rating-calculator:io.import.lxns.close')}</Button>
        <Button
          onClick={async () => {
            setBusy(true)
            try {
              if (invalidReason) {
                toast.error(t('rating-calculator:io.import.lxns.invalid-profile'))
                return
              }
              if (!sheets) {
                toast.error(t('rating-calculator:io.import.lxns.no-sheets'))
                return
              }
              await fetchLxnsData(sheets, lxnsConfig!, modifyEntries)
              onClose()
            } finally {
              setBusy(false)
            }
          }}
          disabled={!!invalidReason || busy}
          variant="contained"
        >
          {busy ? (
            <div className="flex gap-2 items-center">
              <CircularProgress size="1rem" className="text-zinc-5" />

              <span className="text-zinc-5">{t('rating-calculator:io.import.lxns.importing')}</span>
            </div>
          ) : invalidReason ? (
            <div className="flex flex-col gap-1 items-end py-1">
              <span className="leading-none">{t('rating-calculator:io.import.lxns.import')}</span>
              <span className="text-xs opacity-50 leading-none">
                {invalidReason === 'missing'
                  ? t('rating-calculator:io.import.lxns.missing-profile-info')
                  : t('rating-calculator:io.import.lxns.only-one-of-the-two-fields-should-be-filled')}
              </span>
            </div>
          ) : (
            t('rating-calculator:io.import.lxns.import')
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export const ImportFromLxnsButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
    onClose()
  }

  return (
    <>
      <MenuItem
        onClick={() => {
          setOpen(true)
        }}
      >
        <ListItemIcon>
          <CarbonCloud />
        </ListItemIcon>
        <ListItemText
          primary={t('rating-calculator:io.import.lxns.title')}
          secondary={
            <div className="flex gap-1">
              <ImportRegionSupportTag region="cn" />
            </div>
          }
        />
      </MenuItem>

      <Dialog onOpenChange={setOpen} open={open}>
        <ImportLxnsDialogContent modifyEntries={modifyEntries} onClose={handleClose} />
      </Dialog>
    </>
  )
}
