import { useSongCatalogLoader } from '@/catalog/CatalogContext'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  FormControl,
  FormControlLabel,
  Link as MuiLink,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { type FC, useState, useSyncExternalStore } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useLocalStorage } from 'react-use'
import { match } from 'ts-pattern'
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import IconMdiHelpCircleOutline from '~icons/mdi/help-circle-outline'
import { importFromNETRecords } from './importFromNETRecords'
import { NetImportAutoImportOptions } from './NetImportAutoImportOptions'
import { NetMaintenanceNotice } from './NetMaintenanceNotice'
import { useMaimaiNetStatus } from './useMaimaiNetStatus'

import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { toggleFocusRing } from '../../focusRing'
import { netImportProgress } from './netImportProgressStore'

export function NetImportSettingsDialog({
  open,
  onClose,
  onExited,
}: {
  open: boolean
  onClose: () => void
  onExited: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="net-import-settings-title"
      disableRestoreFocus
      TransitionProps={{ onExited }}
    >
      <NetImportSettingsContent onClose={onClose} />
    </Dialog>
  )
}

function readSavedCredentials() {
  const empty = { region: 'intl' as 'intl' | 'jp', username: '', password: '', remember: false }
  try {
    const saved = JSON.parse(localStorage.getItem('import-net-records') ?? 'null')
    if (!saved || typeof saved.username !== 'string' || typeof saved.password !== 'string') return empty
    return {
      region: saved.region === 'jp' ? ('jp' as const) : ('intl' as const),
      username: saved.username,
      password: saved.password,
      remember: true,
    }
  } catch {
    return empty
  }
}

type AutoImportMode = boolean | 'replace' | 'merge'

const NetImportSettingsContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const repository = useScoreRepository()
  const progress = useSyncExternalStore(
    netImportProgress.subscribe,
    netImportProgress.getSnapshot,
    netImportProgress.getServerSnapshot,
  )
  const busy = progress?.status === 'running'

  const { t } = useTranslation()
  const [form, setForm] = useState(readSavedCredentials)
  const { region, username, password, remember } = form
  const [autoImport, setAutoImport] = useLocalStorage<AutoImportMode>('rating-auto-import-from-net', false)
  const mappedAutoImport = match(autoImport as AutoImportMode | 'false')
    .with(true, () => 'replace' as const)
    .with('false', () => false as const)
    .otherwise((value) => value)
  const loadCatalog = useSongCatalogLoader()
  const maintenance = useMaimaiNetStatus(true)

  const updateForm = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch }
    setForm(next)
    if (next.remember) {
      localStorage.setItem(
        'import-net-records',
        JSON.stringify({ region: next.region, username: next.username, password: next.password }),
      )
    } else {
      localStorage.removeItem('import-net-records')
      setAutoImport(false)
    }
  }

  const handleImport = () => {
    // The import reports its own progress; it starts once the complete catalog is there
    void loadCatalog()
      .then((catalog) =>
        importFromNETRecords(catalog, repository, mappedAutoImport || 'replace', undefined, {
          region,
          username,
          password,
        }),
      )
      .catch((error: unknown) => console.error('Failed to import NET records', error))
    onClose()
  }

  return (
    <>
      <DialogTitle id="net-import-settings-title">
        {t('rating-calculator:io.import.net-records.dialog.title')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div" className="flex flex-col items-stretch gap-4 py-2">
          <NetMaintenanceNotice region={region} maintenance={maintenance[region]} />
          <FormControl>
            <TextField
              label={t('rating-calculator:io.import.net-records.dialog.region.label')}
              select
              value={region}
              onChange={(event) => updateForm({ region: event.target.value as 'intl' | 'jp' })}
            >
              <MenuItem value="intl">
                <span>
                  <span>{t('rating-calculator:io.import.net-records.dialog.region.intl.name')} </span>
                  <span className="text-secondary text-sm">
                    {t('rating-calculator:io.import.net-records.dialog.region.intl.domain')}
                  </span>
                </span>
              </MenuItem>
              <MenuItem value="jp">
                <span>
                  <span>{t('rating-calculator:io.import.net-records.dialog.region.jp.name')} </span>
                  <span className="text-secondary text-sm">
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
              onChange={(event) => updateForm({ username: event.target.value })}
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
              onChange={(event) => updateForm({ password: event.target.value })}
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
                onChange={(event) => updateForm({ remember: event.target.checked })}
                sx={toggleFocusRing}
              />
            }
            label={
              <div className="flex flex-col">
                <span>{t('rating-calculator:io.import.net-records.dialog.remember-credentials.label')}</span>
                <span className="text-xs text-secondary">
                  {t('rating-calculator:io.import.net-records.dialog.remember-credentials.description')}
                </span>
              </div>
            }
          />

          <NetImportAutoImportOptions
            value={mappedAutoImport}
            disabled={!remember || !username || !password}
            onChange={setAutoImport}
          />

          <p className="text-xs text-secondary">{t('rating-calculator:io.import.net-records.floating.next-import')}</p>
          <SegaIDImportGuide region={region} />
          <div className="h-px w-full bg-gray-200 my-2" />

          <div className="text-sm text-secondary [&>p]:mb-1">
            <p className="font-bold">
              <Trans
                t={t}
                i18nKey="rating-calculator:io.import.net-records.dialog.security-notice.credentials"
                components={{
                  source: (
                    <a
                      href="https://github.com/gekichumai/dxrating/tree/main/apps/backend"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    />
                  ),
                }}
              />
            </p>

            <p className="text-xs">
              <Trans
                t={t}
                i18nKey="rating-calculator:io.import.net-records.dialog.security-notice.slsa"
                components={{
                  slsa: <a href="https://slsa.dev/" target="_blank" rel="noopener noreferrer" className="underline" />,
                }}
              />
            </p>
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rating-calculator:io.import.net-records.dialog.actions.close')}</Button>
        <Button onClick={handleImport} disabled={!username || !password || busy} variant="contained">
          {busy ? (
            t('rating-calculator:io.import.net-records.dialog.actions.importing')
          ) : mappedAutoImport ? (
            <div className="flex flex-col gap-1 items-start py-1">
              <span className="leading-none">
                {t('rating-calculator:io.import.net-records.dialog.actions.reimport.title')}
              </span>
              <span className="text-xs leading-none">
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

const SegaIDImportGuide: FC<{ region: 'intl' | 'jp' }> = ({ region }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | false>(false)
  const aimeURL = region === 'jp' ? 'https://maimaidx.jp/maimai-mobile/' : 'https://maimaidx-eng.com/maimai-mobile/'

  return (
    <div className="glass-inset mb-2 p-1">
      <div className="flex items-start gap-3 px-3 pb-1 pt-2">
        <IconMdiHelpCircleOutline className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
        <div>
          <div className="font-semibold text-fg-1">
            {t('rating-calculator:io.import.net-records.dialog.help.title')}
          </div>
          <div className="text-sm text-secondary">
            {t('rating-calculator:io.import.net-records.dialog.help.description')}
          </div>
        </div>
      </div>

      <Accordion
        disableGutters
        elevation={0}
        expanded={expanded === 'register'}
        onChange={(_, isExpanded) => setExpanded(isExpanded ? 'register' : false)}
        sx={{ backgroundColor: 'transparent', '&:before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<IconMdiChevronDown />}>
          <Typography fontWeight={600} variant="body2">
            {t('rating-calculator:io.import.net-records.dialog.help.register.title')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="pt-0">
          <HelpSteps
            steps={[
              t('rating-calculator:io.import.net-records.dialog.help.register.step1'),
              t('rating-calculator:io.import.net-records.dialog.help.register.step2'),
              t('rating-calculator:io.import.net-records.dialog.help.register.step3'),
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <MuiLink href="https://gw.sega.jp/gateway/create/create1.html" target="_blank" rel="noopener noreferrer">
              {t('rating-calculator:io.import.net-records.dialog.help.links.sega-id')}
            </MuiLink>
            <MuiLink href={aimeURL} target="_blank" rel="noopener noreferrer">
              {t('rating-calculator:io.import.net-records.dialog.help.links.aime')}
            </MuiLink>
          </div>
        </AccordionDetails>
      </Accordion>

      <Accordion
        disableGutters
        elevation={0}
        expanded={expanded === 'oauth'}
        onChange={(_, isExpanded) => setExpanded(isExpanded ? 'oauth' : false)}
        sx={{ backgroundColor: 'transparent', '&:before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<IconMdiChevronDown />}>
          <Typography fontWeight={600} variant="body2">
            {t('rating-calculator:io.import.net-records.dialog.help.oauth.title')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="pt-0">
          <p className="mb-3 text-sm text-secondary">
            {t('rating-calculator:io.import.net-records.dialog.help.oauth.description')}
          </p>
          <HelpSteps
            steps={[
              t('rating-calculator:io.import.net-records.dialog.help.oauth.step1'),
              t('rating-calculator:io.import.net-records.dialog.help.oauth.step2'),
              t('rating-calculator:io.import.net-records.dialog.help.oauth.step3'),
            ]}
          />
        </AccordionDetails>
      </Accordion>
    </div>
  )
}

const HelpSteps: FC<{ steps: string[] }> = ({ steps }) => (
  <ol className="m-0 flex list-none flex-col gap-2 p-0">
    {steps.map((step, index) => (
      <li key={step} className="flex items-start gap-2 text-sm text-fg-1">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-on-accent">
          {index + 1}
        </span>
        <span>{step}</span>
      </li>
    ))}
  </ol>
)