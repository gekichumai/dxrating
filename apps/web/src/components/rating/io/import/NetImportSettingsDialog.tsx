import { ParaglideMessage } from '@inlang/paraglide-js-react'
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
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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

  const locale = useLocale()
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
        {m.ratingCalculator_io_import_netRecords_dialog_title({}, { locale })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div" className="flex flex-col items-stretch gap-4 py-2">
          <NetMaintenanceNotice region={region} maintenance={maintenance[region]} />
          <FormControl>
            <TextField
              label={m.ratingCalculator_io_import_netRecords_dialog_region_label({}, { locale })}
              select
              value={region}
              onChange={(event) => updateForm({ region: event.target.value as 'intl' | 'jp' })}
            >
              <MenuItem value="intl">
                <span>
                  <span>{m.ratingCalculator_io_import_netRecords_dialog_region_intl_name({}, { locale })} </span>
                  <span className="text-secondary text-sm">
                    {m.ratingCalculator_io_import_netRecords_dialog_region_intl_domain({}, { locale })}
                  </span>
                </span>
              </MenuItem>
              <MenuItem value="jp">
                <span>
                  <span>{m.ratingCalculator_io_import_netRecords_dialog_region_jp_name({}, { locale })} </span>
                  <span className="text-secondary text-sm">
                    {m.ratingCalculator_io_import_netRecords_dialog_region_jp_domain({}, { locale })}
                  </span>
                </span>
              </MenuItem>
            </TextField>
          </FormControl>

          <FormControl>
            <TextField
              label={m.ratingCalculator_io_import_netRecords_dialog_segaId({}, { locale })}
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
              label={m.ratingCalculator_io_import_netRecords_dialog_segaPassword({}, { locale })}
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
                <span>{m.ratingCalculator_io_import_netRecords_dialog_rememberCredentials_label({}, { locale })}</span>
                <span className="text-xs text-secondary">
                  {m.ratingCalculator_io_import_netRecords_dialog_rememberCredentials_description({}, { locale })}
                </span>
              </div>
            }
          />

          <NetImportAutoImportOptions
            value={mappedAutoImport}
            disabled={!remember || !username || !password}
            onChange={setAutoImport}
          />

          <p className="text-xs text-secondary">
            {m.ratingCalculator_io_import_netRecords_floating_nextImport({}, { locale })}
          </p>
          <SegaIDImportGuide region={region} />
          <div className="h-px w-full bg-gray-200 my-2" />

          <div className="text-sm text-secondary [&>p]:mb-1">
            <p className="font-bold">
              <ParaglideMessage
                message={m.ratingCalculator_io_import_netRecords_dialog_securityNotice_credentials}
                inputs={{}}
                options={{ locale }}
                markup={{
                  source: ({ children }) => (
                    <a
                      href="https://github.com/gekichumai/dxrating/tree/main/apps/backend"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              />
            </p>

            <p className="text-xs">
              <ParaglideMessage
                message={m.ratingCalculator_io_import_netRecords_dialog_securityNotice_slsa}
                inputs={{}}
                options={{ locale }}
                markup={{
                  slsa: ({ children }) => (
                    <a href="https://slsa.dev/" target="_blank" rel="noopener noreferrer" className="underline">
                      {children}
                    </a>
                  ),
                }}
              />
            </p>
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {m.ratingCalculator_io_import_netRecords_dialog_actions_close({}, { locale })}
        </Button>
        <Button onClick={handleImport} disabled={!username || !password || busy} variant="contained">
          {busy ? (
            m.ratingCalculator_io_import_netRecords_dialog_actions_importing({}, { locale })
          ) : mappedAutoImport ? (
            <div className="flex flex-col gap-1 items-start py-1">
              <span className="leading-none">
                {m.ratingCalculator_io_import_netRecords_dialog_actions_reimport_title({}, { locale })}
              </span>
              <span className="text-xs leading-none">
                {m.ratingCalculator_io_import_netRecords_dialog_actions_reimport_description({}, { locale })}
              </span>
            </div>
          ) : (
            m.ratingCalculator_io_import_netRecords_dialog_actions_importOnce({}, { locale })
          )}
        </Button>
      </DialogActions>
    </>
  )
}

const SegaIDImportGuide: FC<{ region: 'intl' | 'jp' }> = ({ region }) => {
  const locale = useLocale()
  const [expanded, setExpanded] = useState<string | false>(false)
  const aimeURL = region === 'jp' ? 'https://maimaidx.jp/maimai-mobile/' : 'https://maimaidx-eng.com/maimai-mobile/'

  return (
    <div className="glass-inset mb-2 p-1">
      <div className="flex items-start gap-3 px-3 pb-1 pt-2">
        <IconMdiHelpCircleOutline className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
        <div>
          <div className="font-semibold text-fg-1">
            {m.ratingCalculator_io_import_netRecords_dialog_help_title({}, { locale })}
          </div>
          <div className="text-sm text-secondary">
            {m.ratingCalculator_io_import_netRecords_dialog_help_description({}, { locale })}
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
            {m.ratingCalculator_io_import_netRecords_dialog_help_register_title({}, { locale })}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="pt-0">
          <HelpSteps
            steps={[
              m.ratingCalculator_io_import_netRecords_dialog_help_register_step1({}, { locale }),
              m.ratingCalculator_io_import_netRecords_dialog_help_register_step2({}, { locale }),
              m.ratingCalculator_io_import_netRecords_dialog_help_register_step3({}, { locale }),
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <MuiLink href="https://gw.sega.jp/gateway/create/create1.html" target="_blank" rel="noopener noreferrer">
              {m.ratingCalculator_io_import_netRecords_dialog_help_links_segaId({}, { locale })}
            </MuiLink>
            <MuiLink href={aimeURL} target="_blank" rel="noopener noreferrer">
              {m.ratingCalculator_io_import_netRecords_dialog_help_links_aime({}, { locale })}
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
            {m.ratingCalculator_io_import_netRecords_dialog_help_oauth_title({}, { locale })}
          </Typography>
        </AccordionSummary>
        <AccordionDetails className="pt-0">
          <p className="mb-3 text-sm text-secondary">
            {m.ratingCalculator_io_import_netRecords_dialog_help_oauth_description({}, { locale })}
          </p>
          <HelpSteps
            steps={[
              m.ratingCalculator_io_import_netRecords_dialog_help_oauth_step1({}, { locale }),
              m.ratingCalculator_io_import_netRecords_dialog_help_oauth_step2({}, { locale }),
              m.ratingCalculator_io_import_netRecords_dialog_help_oauth_step3({}, { locale }),
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