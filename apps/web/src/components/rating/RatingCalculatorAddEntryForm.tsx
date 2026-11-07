import { Autocomplete, Button, TextField } from '@mui/material'
import type { RatingEntry } from '@gekichumai/maimai-domain'
import clsx from 'clsx'
import {
  cloneElement,
  type ComponentType,
  type FC,
  type HTMLAttributes,
  memo,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from 'react'
import { Virtuoso } from 'react-virtuoso'
import IconMdiReplace from '~icons/mdi/find-replace'
import IconMdiPlus from '~icons/mdi/plus'
import { type FlattenedSheet, formatSheetToString, useSheets, useSheetsSearchEngine } from '../../songs'
import { calculateRating } from '../../utils/rating'
import { SheetListItemContent } from '../sheet/SheetListItem'
import { useScoreEntries } from '@/models/scores/useScoreRepository'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export interface PlayEntryProviderConfig {
  divingFish?: {
    ratingEligibility: 'b15' | 'b35' | null
  }
}

export type { ComboFlag } from '../../utils/rating'
export type SyncFlag = 'fs' | 'fsp' | 'fsd' | 'fsdp' | 'sync' | null

export interface PlayEntry extends Omit<RatingEntry, 'identity'> {
  identity?: RatingEntry['identity']
  providerConfig?: PlayEntryProviderConfig
}

const ListboxComponent = (({
  children,
  ref,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>> & { ref?: React.Ref<HTMLElement> }) => {
  const data = children as ReactElement<any>[]

  return (
    <Virtuoso
      {...rest}
      className={clsx('!py-0', rest.className)}
      scrollerRef={ref as (ref: HTMLElement | Window | null) => void}
      style={{ ...rest.style, height: 'min(30rem, 40dvh)', maxHeight: 'none' }}
      data={data}
      itemContent={(index, child) => cloneElement(child, { index })}
      increaseViewportBy={500}
      role="listbox"
    />
  )
}) as ComponentType<HTMLAttributes<HTMLElement>>

export const RatingCalculatorAddEntryForm: FC<{
  onSubmit: (entry: PlayEntry) => void
}> = memo(({ onSubmit }) => {
  const { data: sheets } = useSheets()
  const [selectedSheet, setSelectedSheet] = useState<FlattenedSheet | null>(null)
  const [achievementRate, setAchievementRate] = useState<string>('')
  const [achievementRateError, setAchievementRateError] = useState<string | null>(null)
  const locale = useLocale()
  const resetForm = useCallback(() => {
    setSelectedSheet(null)
    setAchievementRate('')
    setAchievementRateError(null)
  }, [])

  const entries = useScoreEntries()
  const found = useMemo(() => {
    return entries?.find((entry) => entry.sheetId === selectedSheet?.id)
  }, [entries, selectedSheet])

  const replacing = useMemo(() => {
    try {
      if (found && achievementRate) {
        const newRating = calculateRating(selectedSheet!.internalLevelValue, Number.parseFloat(achievementRate))
        const currentRating = calculateRating(selectedSheet!.internalLevelValue, found.achievementRate)
        const diff = newRating.ratingAwardValue - currentRating.ratingAwardValue
        if (diff <= 0) return null
        return {
          entry: found,
          newRating,
          currentRating,
          diff,
        }
      }
    } catch {
      // ignore
    }
    return null
  }, [selectedSheet, achievementRate, found])

  // An empty field is not an error while typing or on blur (the Add button is disabled until it has a value): Add
  // empties it, and a red "required" plus the helper line pushing the table down then followed the next blur. It is
  // reported only when the form is submitted without one.
  const validate = useCallback(
    (value: string, { submitting = false }: { submitting?: boolean } = {}) => {
      if (!value) {
        setAchievementRateError(submitting ? m.ratingCalculator_addEntry_validation_required({}, { locale }) : null)
        return
      }
      const parsed = Number.parseFloat(value)
      if (Number.isNaN(parsed)) {
        setAchievementRateError(m.ratingCalculator_addEntry_validation_invalidNumber({}, { locale }))
      } else if (parsed < 0 || parsed > 101) {
        setAchievementRateError(m.ratingCalculator_addEntry_validation_range({}, { locale }))
      } else {
        setAchievementRateError(null)
      }
    },
    [locale],
  )

  const canSubmit =
    !!selectedSheet &&
    achievementRate.trim() !== '' &&
    Number.isFinite(Number(achievementRate)) &&
    Number(achievementRate) >= 0 &&
    Number(achievementRate) <= 101

  if (!sheets) return null

  return (
    <form
      className="rating-add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit || !selectedSheet) {
          if (selectedSheet) validate(achievementRate, { submitting: true })
          return
        }
        onSubmit({ sheetId: selectedSheet.id, achievementRate: Number(achievementRate) })
        resetForm()
      }}
    >
      <div className="rating-add-fields">
        <RatingCalculatorAddEntryFormAutoComplete value={selectedSheet} onChange={setSelectedSheet} />

        <TextField
          className="rating-add-achievement"
          size="small"
          label={m.ratingCalculator_addEntry_achievementRate({}, { locale })}
          variant="outlined"
          value={achievementRate}
          onChange={(e) => {
            setAchievementRate(e.target.value)
            validate(e.target.value)
          }}
          onBlur={() => validate(achievementRate)}
          onWheel={(e) => {
            const target = e.target as HTMLInputElement
            // Prevent the input value change
            target.blur()

            // Prevent the page/container scrolling
            e.stopPropagation()

            // Refocus immediately, on the next tick (after the current function is done)
            setTimeout(() => {
              target.focus()
            }, 0)
          }}
          fullWidth
          error={!!achievementRateError}
          helperText={achievementRateError}
          InputProps={{
            endAdornment: '%',
            type: 'number',
          }}
          inputProps={{ step: 'any', min: 0, max: 101 }}
          data-attr="manual-rating-add-achievement-rate"
        />
        <Button
          variant="contained"
          type="submit"
          className="rating-add-submit"
          disabled={!canSubmit}
          startIcon={replacing ? <IconMdiReplace fontSize="inherit" /> : <IconMdiPlus fontSize="inherit" />}
          data-attr="manual-rating-add-submit"
        >
          {replacing
            ? m.ratingCalculator_addEntry_replace({ diff: replacing.diff }, { locale })
            : m.ratingCalculator_addEntry_add({}, { locale })}
        </Button>
      </div>
      {selectedSheet && (
        <div className="rating-add-preview">
          <div className="w-full flex justify-start">
            {selectedSheet && <SheetListItemContent sheet={selectedSheet} />}
          </div>

          <div className="w-full flex justify-end items-center gap-4">
            {selectedSheet && (
              <div className="flex flex-col items-start gap-0.5">
                {found && (
                  <div className="num">
                    {m.ratingCalculator_addEntry_currentRatingValue(
                      {
                        value: calculateRating(selectedSheet.internalLevelValue, found.achievementRate)
                          .ratingAwardValue,
                      },
                      { locale },
                    )}
                  </div>
                )}
                {replacing ? (
                  <div className="flex flex-col items-start font-bold">
                    <div className="num">
                      {m.ratingCalculator_addEntry_newRatingValue(
                        {
                          value: replacing.newRating.ratingAwardValue,
                        },
                        { locale },
                      )}
                    </div>
                    <div className="glass-inset num text-sm text-accent-strong px-1.5 inline-flex">
                      +{replacing.diff}
                    </div>
                  </div>
                ) : (
                  achievementRate && (
                    <div className="num flex flex-col items-center gap-1">
                      {m.ratingCalculator_addEntry_ratingValue(
                        {
                          value: calculateRating(selectedSheet.internalLevelValue, Number.parseFloat(achievementRate))
                            .ratingAwardValue,
                        },
                        { locale },
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  )
})

export const RatingCalculatorAddEntryFormAutoComplete: FC<{
  value: FlattenedSheet | null
  onChange: (sheet: FlattenedSheet | null) => void
}> = ({ value, onChange }) => {
  const { data: sheets } = useSheets()
  const locale = useLocale()

  const search = useSheetsSearchEngine()
  // What the visitor typed (none after a pick, as MUI shows every chart again then). The search runs on a deferred
  // copy: a keystroke paints the field first, and the results follow in a render after it (the search took
  // ~100-200ms of each keystroke at 4x CPU)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(
    () => (deferredQuery ? search(deferredQuery) : (sheets ?? [])),
    [deferredQuery, search, sheets],
  )

  const renderOption = useCallback(
    (attributes: HTMLAttributes<HTMLLIElement>, option: FlattenedSheet) => (
      <li {...attributes}>
        <SheetListItemContent sheet={option} />
      </li>
    ),
    [],
  )
  if (!sheets) return null

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={sheets}
      getOptionLabel={(sheet) => formatSheetToString(sheet)}
      renderInput={(params) => (
        <TextField {...params} label={m.ratingCalculator_addEntry_chart({}, { locale })} variant="outlined" />
      )}
      onInputChange={(_, inputValue, reason) => setQuery(reason === 'input' ? inputValue : '')}
      filterOptions={() => results}
      renderOption={renderOption}
      ListboxComponent={ListboxComponent}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      data-attr="manual-rating-add-chart"
    />
  )
}