import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'react-use'
import type { ListActions } from 'react-use/lib/useList'
import IconMdiConnection from '~icons/mdi/connection'
import { useSheets } from '../../../../songs'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { type FetchNetRecordProgressState, importFromNETRecords } from './importFromNETRecords'
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
    flags:
      | 'fullCombo'
      | 'fullCombo+'
      | 'allPerfect'
      | 'allPerfect+'
      | 'syncPlay'
      | 'fullSync'
      | 'fullSync+'
      | 'fullSyncDX'
      | 'fullSyncDX+'[]
  }
}

export type MusicRecord = AchievementRecord
export type RecentRecord = AchievementRecord & {
  play: {
    track: number
    timestamp?: string
  }
}

export const ImportFromNETRecordsListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation(['rating-calculator'])

  const handleClose = () => {
    setOpen(false)
    onClose()
  }

  return (
    <>
      {open && (
        <Dialog open={open} onClose={handleClose}>
          <ImportFromNETRecordsDialogContent modifyEntries={modifyEntries} onClose={handleClose} />
        </Dialog>
      )}
      <MenuItem
        className="max-w-xl"
        onClick={() => {
          setOpen(true)
        }}
      >
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
    </>
  )
}

interface ImportFromNETRecordsProgress {
  state: FetchNetRecordProgressState | 'error'
  progress: number
}

export type AutoImportMode = boolean | 'replace' | 'merge'

const ImportFromNETRecordsDialogContent: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation()
  const [remember, setRemember] = useState(false)
  const [region, setRegion] = useState<'intl' | 'jp'>('intl')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [autoImport, setAutoImport] = useLocalStorage<AutoImportMode>('rating-auto-import-from-net', false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportFromNETRecordsProgress | null>(null)
  const mappedAutoImport = autoImport === true ? 'replace' : (autoImport as unknown) === 'false' ? false : autoImport // Legacy support
  const { data: sheets } = useSheets({ acceptsPartialData: true })

  useEffect(() => {
    const stored = localStorage.getItem('import-net-records')
    if (!stored) return
    const { region, username, password } = JSON.parse(stored)
    setRegion(region)
    setUsername(username)
    setPassword(password)
    setRemember(true)
  }, [])

  useEffect(() => {
    if (!remember) {
      localStorage.removeItem('import-net-records')
    } else {
      localStorage.setItem('import-net-records', JSON.stringify({ region, username, password }))
    }
  }, [remember, region, username, password])

  const handleImport = async () => {
    setBusy(true)
    try {
      await importFromNETRecords(sheets!, modifyEntries, mappedAutoImport || 'replace', (state, progress) => {
        setProgress({ state, progress })
      })
      onClose()
    } catch (e) {
      setProgress((progress) => ({
        state: 'error',
        progress: progress?.progress ?? 0,
      }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle>{t('rating-calculator:io.import.net-records.dialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText className="flex flex-col items-start gap-2 py-2">
          <FormControl>
            <TextField
              label={t('rating-calculator:io.import.net-records.dialog.region.label')}
              select
              value={region}
              onChange={(event) => setRegion(event.target.value as 'intl' | 'jp')}
            >
              <MenuItem value="intl">
                <span>
                  <span>{t('rating-calculator:io.import.net-records.dialog.region.intl.name')} </span>
                  <span className="text-zinc-4 text-sm">
                    {t('rating-calculator:io.import.net-records.dialog.region.intl.domain')}
                  </span>
                </span>
              </MenuItem>
              <MenuItem value="jp">
                <span>
                  <span>{t('rating-calculator:io.import.net-records.dialog.region.jp.name')} </span>
                  <span className="text-zinc-4 text-sm">
                    {t('rating-calculator:io.import.net-records.dialog.region.jp.domain')}
                  </span>
                </span>
              </MenuItem>
            </TextField>
          </FormControl>

          <FormControl>
            <TextField
              label={t('rating-calculator:io.import.net-records.dialog.sega-id')}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              inputProps={{
                'data-sentry-ignore': true,
                'data-1p-ignore': true,
              }}
            />
          </FormControl>

          <FormControl>
            <TextField
              label={t('rating-calculator:io.import.net-records.dialog.sega-password')}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              inputProps={{
                'data-sentry-ignore': true,
                'data-1p-ignore': true,
              }}
            />
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={remember}
                onChange={(event) => {
                  setRemember(event.target.checked)
                  if (!event.target.checked) setAutoImport(false)
                }}
              />
            }
            label={
              <div className="flex flex-col">
                <span>{t('rating-calculator:io.import.net-records.dialog.remember-credentials.label')}</span>
                <span className="text-xs text-zinc-500">
                  {t('rating-calculator:io.import.net-records.dialog.remember-credentials.description')}
                </span>
              </div>
            }
          />

          <FormControl>
            <FormLabel id="auto-import-label">
              <div className="flex flex-col">
                <span>{t('rating-calculator:io.import.net-records.dialog.auto-import.label')}</span>
                <span className="text-xs text-zinc-500">
                  {t('rating-calculator:io.import.net-records.dialog.auto-import.description')}
                </span>
              </div>
            </FormLabel>
            <RadioGroup
              aria-labelledby="auto-import-label"
              value={mappedAutoImport}
              onChange={(event) => setAutoImport(event.target.value as AutoImportMode)}
            >
              {[
                {
                  value: 'false',
                  title: t('rating-calculator:io.import.net-records.dialog.auto-import.options.disabled.title'),
                },
                {
                  value: 'replace',
                  title: t('rating-calculator:io.import.net-records.dialog.auto-import.options.replace.title'),
                  subtitle: t('rating-calculator:io.import.net-records.dialog.auto-import.options.replace.description'),
                },
                {
                  value: 'merge',
                  title: t('rating-calculator:io.import.net-records.dialog.auto-import.options.merge.title'),
                  subtitle: t('rating-calculator:io.import.net-records.dialog.auto-import.options.merge.description'),
                },
              ].map(({ value, title, subtitle }) => (
                <FormControlLabel
                  key={value.toString()}
                  value={value}
                  control={<Radio size="small" />}
                  disabled={!remember}
                  label={
                    <div className="flex flex-col gap-1">
                      <span className="leading-none">{title}</span>
                      {subtitle && (
                        <span className={clsx('text-xs', !remember ? 'text-zinc-400' : 'text-zinc-500')}>
                          {subtitle}
                        </span>
                      )}
                    </div>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>

          <div className="h-px w-full bg-gray-200 my-2" />

          {progress && (
            <>
              <div className="flex flex-col gap-1 w-full items-center">
                <LinearProgress
                  variant="determinate"
                  value={progress.progress * 100}
                  color={progress.state === 'error' ? 'error' : 'primary'}
                  className="w-full rounded-full max-w-md"
                />
                <span className="font-bold mt-1">
                  {t('rating-calculator:io.import.net-records.dialog.actions.importing')}
                </span>
                <span className="text-zinc-500 font-mono text-sm">[ {progress.state} ]</span>
              </div>

              <div className="h-px w-full bg-gray-200 my-2" />
            </>
          )}

          <div className="text-sm text-zinc-500 [&>p]:mb-1">
            <p className="font-bold">
              {t('rating-calculator:io.import.net-records.dialog.security-notice.credentials')}{' '}
              <a
                href="https://github.com/gekichumai/dxrating/tree/main/packages/self-hosted-functions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t('rating-calculator:io.import.net-records.dialog.security-notice.source-code')}
              </a>
              .
            </p>

            <p className="text-xs text-zinc-4">
              {t('rating-calculator:io.import.net-records.dialog.security-notice.slsa.text')}{' '}
              <a href="https://slsa.dev/" target="_blank" rel="noopener noreferrer" className="underline">
                {t('rating-calculator:io.import.net-records.dialog.security-notice.slsa.framework')}
              </a>
              {t('rating-calculator:io.import.net-records.dialog.security-notice.slsa.description')}
            </p>
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rating-calculator:io.import.net-records.dialog.actions.close')}</Button>
        <Button onClick={handleImport} disabled={!username || !password || busy} variant="contained">
          {busy ? (
            <div className="flex gap-2 items-center">
              <CircularProgress size="1rem" className="text-zinc-5" />
              <span className="text-zinc-5">
                {t('rating-calculator:io.import.net-records.dialog.actions.importing')}
              </span>
            </div>
          ) : autoImport ? (
            <div className="flex flex-col gap-1 items-start py-1">
              <span className="leading-none">
                {t('rating-calculator:io.import.net-records.dialog.actions.reimport.title')}
              </span>
              <span className="text-xs opacity-50 leading-none">
                {t('rating-calculator:io.import.net-records.dialog.actions.reimport.description')}
              </span>
            </div>
          ) : (
            t('rating-calculator:io.import.net-records.dialog.actions.import-once')
          )}
        </Button>
      </DialogActions>
    </>
  )
}
