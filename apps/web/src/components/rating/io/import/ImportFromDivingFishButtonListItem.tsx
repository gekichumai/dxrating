import { useSongCatalogLoader } from '@/catalog/CatalogContext'
import { ImportRegionSupportTag } from '@/components/rating/io/import/ImportRegionSupportTag'
import type { VersionEnum } from '@gekichumai/dxdata'
import { normalizeDivingFishRows, type SongCatalog } from '@gekichumai/maimai-domain'
import {
  Alert,
  AlertTitle,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
} from '@mui/material'
import { type FC, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'react-use'
import CarbonFish from '~icons/carbon/fish'
import AlertIcon from '~icons/material-symbols/warning'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { WebHaptics } from 'web-haptics'
import type { ComboFlag, SyncFlag } from '../../RatingCalculatorAddEntryForm'
import type { ScoreRepository } from '@/models/scores/ScoreRepository'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { createRatingImportTracker } from '@/lib/analytics'
import type { ImportJobDTO } from '@gekichumai/api-contract'
import { importFallbackEntries, importPath, runServerImportToEnd, summarizeImportJob } from './cloudImport'
import { importFailureMessage } from '@/components/cloud-save/importFailureMessage'
import { ServerImportFailedError } from '@/models/scores/cloudImports'

const haptics = new WebHaptics()

interface DivingFishProfile {
  username?: string
  qq?: string
}

type DivingFishRequestBody = {
  b50: 1
  username?: string
  qq?: string
}

type DivingFishImportMessages = {
  loading: string
  success: (count: number) => string
  /** A cloud save: what the server's job changed */
  serverSuccess: (job: ImportJobDTO) => string
  /** A cloud save: the failed job's code in words */
  serverError?: (code: string) => string
  error: (error: string) => string
}

export interface DivingFishResponseBody {
  additional_rating: number
  charts: Charts
  nickname: string
  plate: null
  rating: number
  user_general_data: null
  username: string
}

export interface Charts {
  /** `dx` is actually b15... */
  dx: Chart[]
  sd: Chart[]
}

export interface Chart {
  achievements: number
  ds: number
  dxScore: number
  fc: ComboFlag
  fs: SyncFlag
  level: string
  level_index: number
  level_label: string
  ra: number
  rate: string
  song_id: number
  title: string
  type: string
}

const fetchDivingFish = async (
  catalog: SongCatalog,
  divingFishProfile: DivingFishProfile | null,
  repository: ScoreRepository,
  messages: DivingFishImportMessages,
) => {
  const toastId = toast.loading(messages.loading)
  const analytics = createRatingImportTracker('diving_fish')
  try {
    const path = importPath(repository)
    if (path === 'server') {
      // A cloud save: the server queries Diving-Fish and keeps the records verified; this page pulls them after
      const profile = divingFishProfile?.username
        ? { username: divingFishProfile.username }
        : divingFishProfile?.qq
          ? { qq: divingFishProfile.qq }
          : null
      if (!profile) throw new Error('No Diving Fish Profile')
      const job = await runServerImportToEnd(repository, 'diving-fish', profile)
      analytics.succeeded(job.counts.fetched, 0)
      haptics.trigger('success')
      toast.success(messages.serverSuccess(job), { id: toastId })
      return
    }

    const body: DivingFishRequestBody = {
      b50: 1,
    }
    if (divingFishProfile?.username) {
      body.username = divingFishProfile?.username
    } else if (divingFishProfile?.qq) {
      body.qq = divingFishProfile?.qq
    } else {
      throw new Error('No Diving Fish Profile')
    }
    const response = await fetch('https://www.diving-fish.com/api/maimaidxprober/query/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Unsatisfactory status code: ${response.status}: ${await response.text()}`)
    }

    const data = (await response.json()) as DivingFishResponseBody
    const importResult = normalizeDivingFishRows(catalog, [
      ...data.charts.dx.map((row) => ({ ...row, bucket: 'b15' as const })),
      ...data.charts.sd.map((row) => ({ ...row, bucket: 'b35' as const })),
    ])
    const entries = importResultToPlayEntries(importResult)
    for (const warning of importResult.warnings) {
      console.warn('[ImportFromDivingFishButtonListItem]', warning.message, warning.row)
    }

    if (path === 'client-fallback') {
      // Server imports are off (§7.4): uploaded as client_reported, never verified
      await importFallbackEntries(repository, entries, 'diving-fish')
    } else {
      await repository.applyImport(entries, { source: 'diving-fish', mode: 'replace' })
    }
    analytics.succeeded(entries.length, importResult.warnings.length)
    haptics.trigger('success')
    toast.success(messages.success(entries.length), {
      id: toastId,
    })
  } catch (error) {
    analytics.failed(
      error instanceof Error && error.message === 'No Diving Fish Profile' ? 'missing_profile' : 'provider_error',
    )
    console.error('There was a problem with the fetch operation:', error)
    // A cloud save's server import that failed: what happened in words, not its code
    const message =
      error instanceof ServerImportFailedError
        ? (messages.serverError?.(error.code) ?? messages.error(''))
        : messages.error(String(formatErrorMessage(error)))
    toast.error(message, {
      id: toastId,
    })
  }
}

export const ImportDivingFishDialogContent: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const loadCatalog = useSongCatalogLoader()
  const repository = useScoreRepository()
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation(['rating-calculator'])
  const [divingFishConfig, setDivingFishConfig] = useLocalStorage<DivingFishProfile | null>('diving-fish-profile', null)

  const invalidReason = useMemo(() => {
    if (!divingFishConfig) return 'missing' as const
    if (!divingFishConfig.username && !divingFishConfig.qq) return 'missing' as const
    if (divingFishConfig.username && divingFishConfig.qq) return 'excessive' as const
    return null
  }, [divingFishConfig])

  return (
    <>
      <DialogTitle>{t('rating-calculator:io.import.diving-fish.title')}</DialogTitle>
      <DialogContent className="flex flex-col items-start gap-2">
        <div className="text-sm text-zinc-5 mb-2">{t('rating-calculator:io.import.diving-fish.description')}</div>

        <Alert severity="error" icon={<AlertIcon />} className="font-bold w-full">
          <AlertTitle>{t('rating-calculator:io.import.diving-fish.warning.title')}</AlertTitle>
          {t('rating-calculator:io.import.diving-fish.warning.description')}
        </Alert>

        <TextField
          fullWidth
          label={t('settings:import-provider.diving-fish.username')}
          value={divingFishConfig?.username ?? ''}
          onChange={(e) => {
            setDivingFishConfig({
              ...divingFishConfig,
              username: e.target.value,
            })
          }}
          data-attr="diving-fish-profile.username"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />

        <div className="w-full flex items-center gap-2 select-none">
          <div className="h-px w-full bg-zinc-200" />
          <span className="text-sm text-zinc-5 whitespace-nowrap">
            {t('rating-calculator:io.import.diving-fish.or')}
          </span>
          <div className="h-px w-full bg-zinc-200" />
        </div>

        <TextField
          fullWidth
          label={t('settings:import-provider.diving-fish.qq')}
          value={divingFishConfig?.qq ?? ''}
          onChange={(e) => {
            setDivingFishConfig({
              ...divingFishConfig,
              qq: e.target.value,
            })
          }}
          data-attr="diving-fish-profile.qq"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />

        {busy && (
          <div className="w-full flex justify-center items-center py-4 bg-white/70 rounded absolute inset-0 z-100 backdrop-blur-sm">
            <CircularProgress size="1rem" />
          </div>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('rating-calculator:io.import.diving-fish.close')}</Button>
        <Button
          onClick={async () => {
            setBusy(true)
            try {
              if (invalidReason) {
                toast.error(t('rating-calculator:io.import.diving-fish.invalid-profile'))
                return
              }
              await fetchDivingFish(await loadCatalog(), divingFishConfig!, repository, {
                loading: t('rating-calculator:io.import.diving-fish.loading'),
                success: (count) => t('rating-calculator:io.import.diving-fish.success', { count }),
                serverSuccess: (job) =>
                  t('rating-calculator:cloud-save.import.success', {
                    source: 'Diving-Fish',
                    summary: summarizeImportJob(job, t),
                  }),
                serverError: (code) => importFailureMessage(code, t),
                error: (error) => t('rating-calculator:io.import.diving-fish.error', { error }),
              })
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
              <CircularProgress size="1rem" />
              <span>{t('rating-calculator:io.import.diving-fish.importing')}</span>
            </div>
          ) : invalidReason ? (
            <div className="flex flex-col gap-1 items-end py-1">
              <span className="leading-none">{t('rating-calculator:io.import.diving-fish.import')}</span>
              <span className="text-xs opacity-50 leading-none">
                {invalidReason === 'missing'
                  ? t('rating-calculator:io.import.diving-fish.missing-profile-info')
                  : t('rating-calculator:io.import.diving-fish.only-one-of-the-two-fields-should-be-filled')}
              </span>
            </div>
          ) : (
            t('rating-calculator:io.import.diving-fish.import')
          )}
        </Button>
      </DialogActions>
    </>
  )
}

export const ImportFromDivingFishButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
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
          <CarbonFish />
        </ListItemIcon>
        <ListItemText
          primary={t('rating-calculator:io.import.diving-fish.title')}
          secondary={
            <div className="flex gap-1">
              <ImportRegionSupportTag region="cn" />
            </div>
          }
        />
      </MenuItem>

      <Dialog onClose={handleClose} open={open}>
        <ImportDivingFishDialogContent onClose={handleClose} />
      </Dialog>
    </>
  )
}