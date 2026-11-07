import { VERSION_ID_MAP, VERSION_IDS, type VersionEnum } from '@gekichumai/dxdata'
import { type FC, useMemo } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useAppContextDXDataVersion } from '../../../models/context/useAppContext'
import { VersionMultiSelect } from '../../version/VersionPicker'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const SheetVersionFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const locale = useLocale()
  const appVersion = useAppContextDXDataVersion()
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.versions'>({
    control,
    name: 'filters.versions',
  })

  // Versions up to the selected data version; later ones have no charts yet
  const available = useMemo(
    () => VERSION_IDS.filter((version) => (VERSION_ID_MAP.get(version) ?? 0) <= (VERSION_ID_MAP.get(appVersion) ?? 0)),
    [appVersion],
  )

  return (
    <SheetFilterSection titleLeft={m.sheet_filter_version_title({}, { locale })} reset={reset}>
      <VersionMultiSelect
        available={available}
        value={value}
        label={m.sheet_filter_version_title({}, { locale })}
        allLabel={m.versions_picker_all({}, { locale })}
        // Choosing none or every version is no filter: the form's "all" is every version, so the filter reads as unset
        onChange={(next: VersionEnum[]) =>
          onChange(next.length === 0 || next.length === available.length ? [...VERSION_IDS] : next)
        }
      />
    </SheetFilterSection>
  )
}