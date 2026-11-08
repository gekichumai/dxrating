import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import * as Sentry from '@/lib/telemetry'
import { type FC, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import IconMdiImage from '~icons/mdi/image'
import { useAppContext, useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import { useRatingEntries } from '../../useRatingEntries'
import { mapCalculatedEntryForOneShot } from './oneshotPayload'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { ShareImageActions, useObjectUrl } from '@/components/global/ShareImageViewer'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
        // The display has 0.1s resolution
      }, 100)
    } else {
      if (timer.current !== null) {
        clearInterval(timer.current)
      }
    }

    return () => {
      if (timer.current !== null) {
        clearInterval(timer.current)
      }
    }
  }, [isLoading])

  return elapsedTime
}

const RenderToOneShotImageDialogContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const locale = useLocale()
  const { b15Entries, b35Entries, allEntries } = useRatingEntries()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()

  const { data, isValidating, error, mutate } = useSWR(
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

        return blob
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
  const imageUrl = useObjectUrl(data)

  return (
    <>
      <DialogTitle className="text-lg font-bold pb-0">
        {m.ratingCalculator_io_export_oneshotImage_dialog_title({}, { locale })}
      </DialogTitle>

      <DialogContent classes={{ root: '!pt-4' }}>
        <DialogContentText component="div">
          {isValidating ? (
            <div className="flex flex-col relative">
              <div className="aspect-[1500/1100] w-full bg-gray-300 rounded-[var(--radius-md)] motion-safe:animate-pulse" />

              <div className="absolute inset-0 flex flex-col gap-1 items-center justify-center p-4">
                <CircularProgress />

                <div className="text-lg font-bold">
                  {m.ratingCalculator_io_export_oneshotImage_dialog_loading_title({}, { locale })}
                </div>

                <div className="text-base font-bold num">
                  {elapsedTime
                    ? `${(elapsedTime / 1000).toFixed(1)}s`
                    : m.ratingCalculator_io_export_oneshotImage_dialog_loading_calculating({}, { locale })}
                </div>

                <div className="text-sm">
                  {m.ratingCalculator_io_export_oneshotImage_dialog_loading_message({}, { locale })}
                </div>
              </div>
            </div>
          ) : error ? (
            <p role="alert" className="m-0 text-danger">
              {m.ratingCalculator_io_export_oneshotImage_dialog_error({}, { locale })}
            </p>
          ) : (
            imageUrl && (
              <img
                src={imageUrl}
                alt={m.ratingCalculator_io_export_oneshotImage_previewAlt({}, { locale })}
                className="block w-full h-auto rounded-[var(--radius-md)] [-webkit-touch-callout:default]"
                style={{ boxShadow: 'var(--shadow-overlay)' }}
              />
            )
          )}

          {data && !isValidating && !error && (
            <div className="mt-4">
              <ShareImageActions
                blob={data}
                filename={data.type === 'image/png' ? 'dxrating-b50.png' : 'dxrating-b50.jpg'}
                shareTitle={m.ratingCalculator_io_export_oneshotImage_dialog_title({}, { locale })}
              />
            </div>
          )}

          <div className="text-secondary mt-4 flex flex-col gap-1">
            <div className="text-sm font-bold">
              {m.ratingCalculator_io_export_oneshotImage_dialog_saveInstruction({}, { locale })}
            </div>

            <div className="text-xs">{m.ratingCalculator_io_export_oneshotImage_dialog_betaNotice({}, { locale })}</div>
          </div>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {error && !isValidating && (
          <Button onClick={() => void mutate()}>
            {m.ratingCalculator_io_export_oneshotImage_dialog_retry({}, { locale })}
          </Button>
        )}
        <Button onClick={onClose}>{m.ratingCalculator_io_export_oneshotImage_dialog_close({}, { locale })}</Button>
      </DialogActions>
    </>
  )
}

export const RenderToOneShotImageButton: FC = () => {
  const locale = useLocale()
  const { isLoading, b15Entries, b35Entries, allEntries } = useRatingEntries()
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
        disabled={isLoading}
        startIcon={<IconMdiImage />}
      >
        {m.ratingCalculator_io_export_oneshotImage_button({}, { locale })}
      </Button>

      <Dialog maxWidth="md" open={open} onClose={() => setOpen(false)}>
        <RenderToOneShotImageDialogContent onClose={() => setOpen(false)} />
      </Dialog>
    </>
  )
}