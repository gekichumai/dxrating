import { Button, CircularProgress, Dialog, DialogContent, DialogContentText, DialogTitle, Grow } from '@mui/material'
import { usePostHog } from 'posthog-js/react'
import { type FC, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import IconMdiImage from '~icons/mdi/image'
import { useAppContext, useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { type RatingCalculatorEntry, useRatingEntries } from '../../useRatingEntries'

const useElapsedTime = (isLoading: boolean) => {
  const startTime = useRef<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      startTime.current = Date.now()
      setElapsedTime(null)
      timer.current = window.setInterval(() => {
        if (startTime.current) {
          setElapsedTime(Date.now() - startTime.current)
        }
      }, 1 / 60)
    } else {
      if (timer.current !== null) {
        clearTimeout(timer.current)
      }
    }

    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
      }
    }
  }, [isLoading])

  return elapsedTime
}

const mapCalculatedEntries = (entry: RatingCalculatorEntry) => {
  return {
    sheetId: entry.sheet.id,
    achievementRate: entry.achievementRate,
  }
}

const RenderToOneShotImageDialogContent = () => {
  const { t } = useTranslation(['rating-calculator'])
  const posthog = usePostHog()
  const { b15Entries, b35Entries, allEntries } = useRatingEntries()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()

  const { data, isValidating, error } = useSWR(
    `miruku::functions/oneshot-renderer?data=${JSON.stringify(allEntries)}&version=${version}&region=${region}`,
    async () => {
      const from = Date.now()
      const response = await fetch('https://miruku.dxrating.net/functions/render-oneshot/v0?pixelated=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version,
          region,
          calculatedEntries: {
            b15: b15Entries.map(mapCalculatedEntries),
            b35: b35Entries.map(mapCalculatedEntries),
          },
        }),
      })
      const blob = await response.blob()

      posthog?.capture('oneshot_rendered', {
        duration_seconds: Date.now() - from,
      })

      return URL.createObjectURL(blob)
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  )
  const elapsedTime = useElapsedTime(isValidating)

  return (
    <>
      <DialogTitle className="text-lg font-bold pb-0">
        {t('rating-calculator:io.export.oneshot-image.dialog.title')}
      </DialogTitle>

      <DialogContent classes={{ root: '!pt-4' }}>
        <DialogContentText>
          {isValidating ? (
            <div className="flex flex-col relative">
              <div className="aspect-[1500/1100] w-full bg-gray-300 rounded-md animate-pulse" />

              <div className="absolute inset-0 flex flex-col gap-1 items-center justify-center p-4">
                <CircularProgress />

                <div className="text-lg font-bold tracking-tight">
                  {t('rating-calculator:io.export.oneshot-image.dialog.loading.title')}
                </div>

                <div className="text-base font-bold tabular-nums tracking-tight font-mono">
                  {elapsedTime
                    ? `${(elapsedTime / 1000).toFixed(1)}s`
                    : t('rating-calculator:io.export.oneshot-image.dialog.loading.calculating')}
                </div>

                <div className="text-sm">{t('rating-calculator:io.export.oneshot-image.dialog.loading.message')}</div>
              </div>
            </div>
          ) : error ? (
            <div className="text-red-500">
              {t('rating-calculator:io.export.oneshot-image.dialog.error', { message: error.message })}
            </div>
          ) : (
            <img
              src={data}
              alt="OneShot"
              className="shadow rounded-md"
              style={{
                boxShadow: `0 0 8px hsl(0deg 0% 0% / 0.25),
                0 1px 1px hsl(0deg 0% 0% / 0.075),
      0 2px 2px hsl(0deg 0% 0% / 0.075),
      0 4px 4px hsl(0deg 0% 0% / 0.075),
      0 8px 8px hsl(0deg 0% 0% / 0.075),
      0 16px 16px hsl(0deg 0% 0% / 0.075)`,
              }}
            />
          )}

          <div className="text-zinc-500 mt-4 flex flex-col gap-1">
            <div className="text-sm font-bold">
              {t('rating-calculator:io.export.oneshot-image.dialog.save-instruction')}
            </div>

            <div className="text-xs">{t('rating-calculator:io.export.oneshot-image.dialog.beta-notice')}</div>
          </div>
        </DialogContentText>
      </DialogContent>
    </>
  )
}

export const RenderToOneShotImageButton: FC = () => {
  const { t } = useTranslation()
  const posthog = usePostHog()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true)
          posthog?.capture('oneshot_render_button_clicked')
        }}
        variant="contained"
        color="primary"
        startIcon={<IconMdiImage />}
      >
        {t('rating-calculator:io.export.oneshot-image.button')}
      </Button>

      <Dialog TransitionComponent={Grow} maxWidth="md" open={open} onClose={() => setOpen(false)}>
        <RenderToOneShotImageDialogContent />
      </Dialog>
    </>
  )
}
