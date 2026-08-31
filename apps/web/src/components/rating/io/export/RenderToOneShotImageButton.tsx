import { Button, CircularProgress, Dialog, DialogContent, DialogContentText, DialogTitle, Grow } from '@mui/material'
import * as Sentry from '@sentry/tanstackstart-react'
import { type FC, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import IconMdiImage from '~icons/mdi/image'
import { useAppContext, useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { useRatingEntries } from '../../useRatingEntries'
import { mapCalculatedEntryForOneShot } from './oneshotPayload'
import { captureAnalyticsEvent } from '@/lib/analytics'

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

const RenderToOneShotImageDialogContent = () => {
  const { t } = useTranslation(['rating-calculator'])
  const { b15Entries, b35Entries, allEntries } = useRatingEntries()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()

  const { data, isValidating, error } = useSWR(
    `miruku::functions/oneshot-renderer?data=${JSON.stringify(allEntries)}&version=${version}&region=${region}`,
    async () => {
      const from = performance.now()
      try {
        const response = await fetch('https://miruku.dxrating.net/functions/render-oneshot/v0?pixelated=1', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version,
            region,
            calculatedEntries: {
              b15: b15Entries.map(mapCalculatedEntryForOneShot),
              b35: b35Entries.map(mapCalculatedEntryForOneShot),
            },
          }),
        })
        if (!response.ok) {
          throw new Error(`render_request_http_${response.status}`)
        }
        const blob = await response.blob()

        const duration = performance.now() - from
        captureAnalyticsEvent('oneshot_rendered', {
          duration_ms: duration,
          duration_seconds: duration / 1000,
          entry_count: allEntries.length,
          response_size_bytes: blob.size,
        })
        Sentry.metrics.distribution('oneshot_render.duration', duration, {
          unit: 'millisecond',
        })

        return URL.createObjectURL(blob)
      } catch (error) {
        const duration = performance.now() - from
        captureAnalyticsEvent('oneshot_render_failed', {
          duration_ms: duration,
          entry_count: allEntries.length,
          error_code:
            error instanceof Error && error.message.startsWith('render_request_http_')
              ? error.message
              : 'network_or_render_error',
        })
        Sentry.metrics.count('oneshot_render.failure', 1)
        throw error
      }
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
              alt={t('rating-calculator:io.export.oneshot-image.preview-alt')}
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
  const { b15Entries, b35Entries, allEntries } = useRatingEntries()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true)
          captureAnalyticsEvent('oneshot_render_button_clicked', {
            entry_count: allEntries.length,
            b15_count: b15Entries.length,
            b35_count: b35Entries.length,
          })
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