import { Autocomplete, Button, TextField } from '@mui/material'
import type { RatingEntry } from '@gekichumai/maimai-domain'
import clsx from 'clsx'
import {
  Children,
  isValidElement,
  cloneElement,
  type ComponentType,
  type FC,
  type HTMLAttributes,
  memo,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import IconMdiReplace from '~icons/mdi/find-replace'
import IconMdiPlus from '~icons/mdi/plus'
import { useRatingCalculatorContext } from '../../models/context/RatingCalculatorContext'
import { type FlattenedSheet, formatSheetToString, useSheets, useSheetsSearchEngine } from '../../songs'
import { calculateRating } from '../../utils/rating'
import { SheetListItemContent } from '../sheet/SheetListItem'

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
  const data = Children.toArray(children).filter(isValidElement<{ index?: number }>)

  return (
    <Virtuoso
      {...rest}
      className={clsx('!py-0', rest.className)}
      scrollerRef={(element) => {
        const node = element instanceof HTMLElement ? element : null
        if (typeof ref === 'function') ref(node)
        else if (ref !== undefined && ref !== null) ref.current = node
      }}
      style={{ ...rest.style, height: 'min(30rem, 40dvh)', maxHeight: 'none' }}
      data={data}
      itemContent={(index, child) => cloneElement(child, { index })}
      increaseViewportBy={500}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- MUI Autocomplete requires a virtualized rich listbox, which cannot be represented by a native select.
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
  const { t } = useTranslation(['rating-calculator'])
  const resetForm = useCallback(() => {
    setSelectedSheet(null)
    setAchievementRate('')
    setAchievementRateError(null)
  }, [])

  const { entries } = useRatingCalculatorContext()
  const found = useMemo(() => {
    return entries?.find((entry) => entry.sheetId === selectedSheet?.id)
  }, [entries, selectedSheet])

  const replacing = useMemo(() => {
    try {
      if (found !== undefined && achievementRate !== '') {
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

  const validate = useCallback(
    (value: string) => {
      if (value === '') {
        setAchievementRateError(t('rating-calculator:add-entry.validation.required'))
      }
      try {
        const parsed = Number.parseFloat(value)
        if (Number.isNaN(parsed)) {
          setAchievementRateError(t('rating-calculator:add-entry.validation.invalid-number'))
        } else if (parsed < 0 || parsed > 101) {
          setAchievementRateError(t('rating-calculator:add-entry.validation.range'))
        } else {
          setAchievementRateError(null)
        }
      } catch (e) {
        setAchievementRateError(
          `${t('rating-calculator:add-entry.validation.invalid-number')}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    },
    [t],
  )

  const canSubmit =
    selectedSheet !== null &&
    achievementRate.trim() !== '' &&
    Number.isFinite(Number(achievementRate)) &&
    Number(achievementRate) >= 0 &&
    Number(achievementRate) <= 101

  if (sheets === undefined) return null

  return (
    <form
      className="rating-add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit || selectedSheet === null) return
        onSubmit({ sheetId: selectedSheet.id, achievementRate: Number(achievementRate) })
        resetForm()
      }}
    >
      <div className="rating-add-fields">
        <RatingCalculatorAddEntryFormAutoComplete value={selectedSheet} onChange={setSelectedSheet} />

        <TextField
          className="rating-add-achievement"
          size="small"
          label={t('rating-calculator:add-entry.achievement-rate')}
          variant="outlined"
          value={achievementRate}
          onChange={(e) => {
            setAchievementRate(e.target.value)
            validate(e.target.value)
          }}
          onBlur={() => validate(achievementRate)}
          onWheel={(e) => {
            const target = e.target
            if (!(target instanceof HTMLInputElement)) return
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
          error={achievementRateError !== null && achievementRateError !== ''}
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
          startIcon={replacing !== null ? <IconMdiReplace fontSize="inherit" /> : <IconMdiPlus fontSize="inherit" />}
          data-attr="manual-rating-add-submit"
        >
          {replacing !== null
            ? t('rating-calculator:add-entry.replace', { diff: replacing.diff })
            : t('rating-calculator:add-entry.add')}
        </Button>
      </div>
      {selectedSheet !== null && (
        <div className="rating-add-preview">
          <div className="w-full flex justify-start">
            {selectedSheet !== null && <SheetListItemContent sheet={selectedSheet} />}
          </div>

          <div className="w-full flex justify-end items-center gap-4">
            {selectedSheet !== null && (
              <div className="flex flex-col items-start gap-0.5">
                {found !== undefined && (
                  <div>
                    {t('rating-calculator:add-entry.current-rating')}:{' '}
                    {calculateRating(selectedSheet.internalLevelValue, found.achievementRate).ratingAwardValue}
                  </div>
                )}
                {replacing !== null ? (
                  <div className="flex flex-col items-start font-bold">
                    <div>
                      {t('rating-calculator:add-entry.new-rating')}: {replacing.newRating.ratingAwardValue}
                    </div>
                    <div className="text-sm bg-amber-3 b-2 border-solid border-amber-4 text-black px-1.5 rounded inline-flex">
                      +{replacing.diff}
                    </div>
                  </div>
                ) : (
                  achievementRate !== '' && (
                    <div className="flex flex-col items-center gap-1">
                      {t('rating-calculator:add-entry.rating')}:{' '}
                      {
                        calculateRating(selectedSheet.internalLevelValue, Number.parseFloat(achievementRate))
                          .ratingAwardValue
                      }
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
  const { t } = useTranslation(['rating-calculator'])

  const search = useSheetsSearchEngine()

  const renderOption = useCallback(
    (attributes: HTMLAttributes<HTMLLIElement>, option: FlattenedSheet) => (
      <li {...attributes}>
        <SheetListItemContent sheet={option} />
      </li>
    ),
    [],
  )
  if (sheets === undefined) return null

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={sheets}
      getOptionLabel={(sheet) => formatSheetToString(sheet)}
      renderInput={(params) => (
        <TextField {...params} label={t('rating-calculator:add-entry.chart')} variant="outlined" />
      )}
      filterOptions={(_, { inputValue }) => {
        if (inputValue === '') return sheets
        return search(inputValue)
      }}
      renderOption={renderOption}
      ListboxComponent={ListboxComponent}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      data-attr="manual-rating-add-chart"
    />
  )
}