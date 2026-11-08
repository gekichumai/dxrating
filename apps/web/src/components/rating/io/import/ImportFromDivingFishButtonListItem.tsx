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
import { useLocalStorage } from 'react-use'
import CarbonFish from '~icons/carbon/fish'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { WebHaptics } from 'web-haptics'
import type { ComboFlag, SyncFlag } from '../../RatingCalculatorAddEntryForm'
import type { WebScoreRepository } from '@/models/scores/ScoreRepository'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { createRatingImportTracker } from '@/lib/analytics'
import type { ImportJobDTO } from '@gekichumai/api-contract'
import {
  importFallbackEntries,
  importPath,
  runServerImportToEnd,
  maskedRowsNotice,
  summarizeImportJob,
} from './cloudImport'
import { importFailureMessage } from '@/components/cloud-save/importFailureMessage'
import { ServerImportFailedError } from '@/models/scores/cloudImports'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
  cancelled: string
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
  repository: WebScoreRepository,
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
      // The local save: previewed and confirmed, and it can be undone (meta#35)
      const { applied } = await reviewAndApplyImport(
        repository,
        entries,
        { source: 'diving-fish', mode: 'replace' },
        { trigger: 'manual' },
      )
      if (!applied) {
        analytics.failed('cancelled_by_user')
        toast(messages.cancelled, { id: toastId })
        return
      }
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
  const locale = useLocale()
  const [divingFishConfig, setDivingFishConfig] = useLocalStorage<DivingFishProfile | null>('diving-fish-profile', null)

  const invalidReason = useMemo(() => {
    if (!divingFishConfig) return 'missing' as const
    if (!divingFishConfig.username && !divingFishConfig.qq) return 'missing' as const
    if (divingFishConfig.username && divingFishConfig.qq) return 'excessive' as const
    return null
  }, [divingFishConfig])

  return (
    <>
      <DialogTitle>{m.ratingCalculator_io_import_divingFish_title({}, { locale })}</DialogTitle>
      <DialogContent className="flex flex-col items-start gap-2">
        <div className="text-sm text-secondary mb-2">
          {m.ratingCalculator_io_import_divingFish_description({}, { locale })}
        </div>

        <Alert severity="warning" className="w-full">
          <AlertTitle>{m.ratingCalculator_io_import_divingFish_warning_title({}, { locale })}</AlertTitle>
          {m.ratingCalculator_io_import_divingFish_warning_description({}, { locale })}
        </Alert>

        <TextField
          fullWidth
          label={m.settings_importProvider_divingFish_username({}, { locale })}
          value={divingFishConfig?.username ?? ''}
          onChange={(e) => {
            setDivingFishConfig({
              ...divingFishConfig,
              username: e.target.value,
            })
          }}
          data-attr="diving-fish-profile.username"
          error={invalidReason === 'excessive'}
          helperText={
            invalidReason === 'missing'
              ? m.ratingCalculator_io_import_divingFish_missingProfileInfo({}, { locale })
              : invalidReason === 'excessive'
                ? m.ratingCalculator_io_import_divingFish_onlyOneOfTheTwoFieldsShouldBeFilled({}, { locale })
                : undefined
          }
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />

        <div className="w-full flex items-center gap-2 select-none">
          <div className="h-px w-full bg-zinc-200" />
          <span className="text-sm text-secondary whitespace-nowrap uppercase tracking-[0.05em]">
            {m.ratingCalculator_io_import_divingFish_or({}, { locale })}
          </span>
          <div className="h-px w-full bg-zinc-200" />
        </div>

        <TextField
          fullWidth
          label={m.settings_importProvider_divingFish_qq({}, { locale })}
          value={divingFishConfig?.qq ?? ''}
          onChange={(e) => {
            setDivingFishConfig({
              ...divingFishConfig,
              qq: e.target.value,
            })
          }}
          data-attr="diving-fish-profile.qq"
          error={invalidReason === 'excessive'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />

        {busy && (
          <div className="w-full flex justify-center items-center py-4 bg-white/70 rounded-[inherit] absolute inset-0 z-100 backdrop-blur-sm">
            <CircularProgress size="1rem" />
          </div>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{m.ratingCalculator_io_import_divingFish_close({}, { locale })}</Button>
        <Button
          onClick={async () => {
            setBusy(true)
            try {
              if (invalidReason) {
                toast.error(m.ratingCalculator_io_import_divingFish_invalidProfile({}, { locale }))
                return
              }
              await fetchDivingFish(await loadCatalog(), divingFishConfig!, repository, {
                loading: m.ratingCalculator_io_import_divingFish_loading({}, { locale }),
                success: (count) => m.ratingCalculator_io_import_divingFish_success({ count }, { locale }),
                serverSuccess: (job) =>
                  [
                    m.ratingCalculator_cloudSave_import_success(
                      {
                        source: 'Diving-Fish',
                        summary: summarizeImportJob(job, locale),
                      },
                      { locale },
                    ),
                    // Rows the player hid on Diving-Fish: said apart, as nothing here can import them
                    maskedRowsNotice(job, locale),
                  ]
                    .filter(Boolean)
                    .join(' '),
                serverError: (code) => importFailureMessage(code, locale),
                error: (error) => m.ratingCalculator_io_import_divingFish_error({ error }, { locale }),
                cancelled: m.ratingCalculator_io_import_review_cancelled({}, { locale }),
              })
              onClose()
            } finally {
              setBusy(false)
            }
          }}
          disabled={busy}
          variant="contained"
        >
          {busy ? (
            <div className="flex gap-2 items-center">
              <CircularProgress size="1rem" />
              <span>{m.ratingCalculator_io_import_divingFish_importing({}, { locale })}</span>
            </div>
          ) : (
            m.ratingCalculator_io_import_divingFish_import({}, { locale })
          )}
        </Button>
      </DialogActions>
    </>
  )
}

export const ImportFromDivingFishButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const locale = useLocale()
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
          primary={m.ratingCalculator_io_import_divingFish_title({}, { locale })}
          secondary={
            <span className="flex gap-1">
              <ImportRegionSupportTag region="cn" />
            </span>
          }
        />
      </MenuItem>

      <Dialog onClose={handleClose} open={open}>
        <ImportDivingFishDialogContent onClose={handleClose} />
      </Dialog>
    </>
  )
}