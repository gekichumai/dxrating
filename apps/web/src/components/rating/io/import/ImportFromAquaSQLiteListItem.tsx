import { getDxdataSongCatalog, normalizeAquaSqliteRows, type ImportWarning } from '@gekichumai/maimai-domain'
import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from '@mui/material'
import { type FC, useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import sqljs, { type Database } from 'sql.js'
import IconMdiDatabase from '~icons/mdi/database'
import { type FlattenedSheet, useSheets } from '../../../../songs'
import { type AquaUser, readAquaGamePlays, readAquaUsers } from '../../../../utils/aquaDB'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { FadedImage } from '../../../global/FadedImage'
import { SheetListItemContent } from '../../../sheet/SheetListItem'
import { useWebHaptics } from 'web-haptics/react'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { importResultToPlayEntries } from './importResultToPlayEntries'

export const ImportFromAquaSQLiteListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator', 'global'])
  const [db, setDb] = useState<Database | null>(null)
  const handleClose = useCallback(() => {
    setDb(null)
    onClose()
  }, [onClose])

  return (
    <>
      {db && (
        <Dialog open={true} onClose={handleClose}>
          <ImportFromAquaSQLiteDatabaseContent db={db} modifyEntries={modifyEntries} onClose={handleClose} />
        </Dialog>
      )}

      <MenuItem
        color="primary"
        onClick={() => {
          toast.promise(
            new Promise((resolve, reject) => {
              const fileInput = document.createElement('input')
              fileInput.type = 'file'
              fileInput.accept = '.sqlite'

              const onChange = async () => {
                const file = fileInput.files?.[0]
                if (!file) {
                  return reject('No file selected')
                }

                const SQL = await sqljs({
                  locateFile: (file) => `https://sql.js.org/dist/${file}`,
                })

                const r = new FileReader()
                r.onload = () => {
                  if (r.result === null || typeof r.result === 'string') {
                    return reject(
                      `Failed to load file: unknown error: no result received from FileReader (typeof: ${typeof r.result})`,
                    )
                  }
                  try {
                    console.info(`Loaded file: ${file.name}`, r.result)
                    const uints = new Uint8Array(r.result)
                    console.log(`Size: ${uints.length}`)
                    const db = new SQL.Database(uints)
                    setDb(db)
                    resolve('Database loaded.')
                  } catch (e) {
                    console.error(e)
                    reject(`Failed to load file: ${e}`)
                  }
                }
                r.onerror = () => {
                  reject(`Failed to load file: ${r.error}`)
                }
                r.readAsArrayBuffer(file)
              }

              fileInput.addEventListener('change', () => {
                onChange()
              })
              fileInput.addEventListener('cancel', () => {
                reject('User cancelled file selection')
              })
              fileInput.click()
            }),
            {
              loading: t('rating-calculator:io.import.aqua-sqlite.loading-db'),
              success: t('rating-calculator:io.import.aqua-sqlite.loaded-db'),
              error: t('rating-calculator:io.import.aqua-sqlite.load-db-failed'),
            },
          )
        }}
      >
        <ListItemIcon>
          <IconMdiDatabase />
        </ListItemIcon>
        <ListItemText primary={t('rating-calculator:io.import.aqua-sqlite.title')} secondary={t('global:deprecated')} />
      </MenuItem>
    </>
  )
}

type AquaFilteredMappedEntry = {
  entry: PlayEntry
  sheet: FlattenedSheet
}

const ImportFromAquaSQLiteDatabaseContent: FC<{
  db: Database
  modifyEntries: ListActions<PlayEntry>
  onClose?: () => void
}> = ({ db, modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator', 'global'])
  const haptic = useWebHaptics()
  const users = useMemo(() => {
    try {
      return readAquaUsers(db)
    } catch (e) {
      toast.error(t('rating-calculator:io.import.aqua-sqlite.read-users-failed', { error: formatErrorMessage(e) }))
      console.error('Failed to read users from Aqua SQLite database', e)
      return []
    }
  }, [db])
  const [selectedUser, setSelectedUser] = useState<AquaUser | null>(null)
  const { data: sheets } = useSheets({ acceptsPartialData: true })
  const appVersion = useAppContextDXDataVersion()
  const { records, warnings } = useMemo(() => {
    if (!selectedUser) return { records: [], warnings: [] }
    if (!sheets) return { records: [], warnings: [] }

    return getUserGamePlays(db, selectedUser, sheets, appVersion)
  }, [appVersion, db, selectedUser, sheets])

  const mode = !selectedUser ? 'select-user' : 'confirm-import'

  return (
    <>
      <DialogTitle className="flex flex-col items-start">
        <div>{t('rating-calculator:io.import.aqua-sqlite.dialog-title')}</div>
        <div className="text-sm text-zinc-500">
          {mode === 'select-user'
            ? t('rating-calculator:io.import.aqua-sqlite.select-user')
            : t('rating-calculator:io.import.aqua-sqlite.confirm-import')}
        </div>
      </DialogTitle>

      <DialogContent>
        {mode === 'select-user' ? (
          <List className="b-1 b-solid b-gray-200 rounded-lg !py-0 overflow-hidden">
            {users.flatMap((user, i) => [
              <ListItemButton key={user.id} onClick={() => setSelectedUser(user)} className="flex gap-2">
                <ListItemAvatar>
                  <FadedImage
                    src={`https://shama.dxrating.net/assetbundle/icon/ui_icon_${String(user.icon_id).padStart(6, '0')}.png`}
                    alt={`Icon ${String(user.icon_id).padStart(6, '0')}`}
                    className="w-16 h-16 rounded-md bg-gray-400"
                  />
                </ListItemAvatar>
                <ListItemText className="flex flex-col">
                  <div>{user.user_name}</div>
                  <div className="tabular-nums font-mono">Rating {user.highest_rating}</div>
                </ListItemText>
              </ListItemButton>,

              i !== users.length - 1 && <Divider component="li" key={`divider-after-${user.id}`} />,
            ])}
          </List>
        ) : (
          <div className="flex flex-col">
            {warnings.length > 0 && (
              <Alert severity="warning" className="mb-4">
                <AlertTitle>{t('global:warnings')}</AlertTitle>

                <ul className="list-disc list-inside">
                  {warnings.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}>
                      {warning.code === 'sheet-not-found'
                        ? t('rating-calculator:io.import.aqua-sqlite.sheet-not-found')
                        : warning.message}{' '}
                      <code className="bg-gray-2 px-1 py-0.5 rounded-sm b-1 b-solid b-gray-3">
                        {formatAquaWarningRow(warning)}
                      </code>
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            <List className="b-1 b-solid b-gray-200 rounded-lg overflow-hidden !p-1 space-y-1">
              {records.map((record) => (
                <ListItem className="flex flex-col gap-2 w-full bg-gray-2 p-1 rounded-md" key={record.entry.sheetId}>
                  <div className="w-full">
                    <SheetListItemContent sheet={record.sheet} />
                  </div>

                  <div className="text-sm self-end">{record.entry.achievementRate}%</div>
                </ListItem>
              ))}
            </List>
          </div>
        )}
      </DialogContent>

      {mode === 'confirm-import' && (
        <DialogActions>
          <Button onClick={() => setSelectedUser(null)}>{t('global:back')}</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={() => {
              modifyEntries.set(records.map((record) => record.entry))

              haptic.trigger('success')
              toast.success(t('rating-calculator:io.import.aqua-sqlite.success', { count: records.length }))

              onClose?.()
            }}
          >
            {t('rating-calculator:io.import.aqua-sqlite.import-action')}
          </Button>
        </DialogActions>
      )}
    </>
  )
}

function getUserGamePlays(
  db: Database,
  selectedUser: AquaUser,
  sheets: FlattenedSheet[],
  appVersion: Parameters<typeof getDxdataSongCatalog>[0],
) {
  const gameplays = readAquaGamePlays(db)
  const importResult = normalizeAquaSqliteRows(getDxdataSongCatalog(appVersion), {
    selectedUserId: selectedUser.id,
    gameplays,
  })
  const entries = importResultToPlayEntries(importResult)
  for (const warning of importResult.warnings) {
    console.warn('[ImportFromAquaSQLiteButton]', warning.message, warning.row)
  }

  const records = entries.flatMap((entry): AquaFilteredMappedEntry[] => {
    const sheet = sheets.find((sheet) => sheet.id === entry.sheetId)
    if (!sheet) {
      console.warn('[ImportFromAquaSQLiteButton] Failed to find normalized sheet: ', entry)
      return []
    }

    return [{ entry, sheet }]
  })

  return {
    records,
    warnings: importResult.warnings,
  }
}

function formatAquaWarningRow(warning: ImportWarning): string {
  if (typeof warning.row !== 'object' || warning.row === null) return warning.message

  const row = warning.row as Record<string, unknown>
  return [
    `code=${warning.code}`,
    `music_id=${String(row.music_id)}`,
    `[${String(row.type)}, ${String(row.level)}]`,
    `achievement=${String(row.achievement)}`,
  ].join(' ')
}