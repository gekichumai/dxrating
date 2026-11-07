import { IconButton, useMediaQuery } from '@mui/material'
import IconMdiClose from '~icons/mdi/close'
import { type FC, useEffect, useState } from 'react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

/**
 * Whether a dialog is open. MUI portals each dialog to <body> and marks a closed, still-mounted one MuiModal-hidden.
 * False on the server and the first client render; toasts only show after mount anyway.
 */
const useDialogOpen = () => {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () => setOpen(document.querySelector('body > .MuiDialog-root:not(.MuiModal-hidden)') !== null)
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'], subtree: false })
    return () => observer.disconnect()
  }, [])
  return open
}

export const CustomizedToaster: FC = () => {
  const locale = useLocale()
  // Same 768px breakpoint as useIsLargeDevice; false on the server and the first client render, so SSR markup matches
  const isLargeDevice = useMediaQuery('(min-width: 768px)')
  // Top-right sits on a dialog's own buttons (copy link, favourite, close), so toasts move to the bottom while one is
  // open. Phones already show them at the bottom, where the chart sheet has no buttons.
  const dialogOpen = useDialogOpen()
  const atTop = isLargeDevice && !dialogOpen

  return (
    <Toaster
      // Phones, and any screen with a dialog open: at the bottom, clear of the header's sign-in button and the
      // dialog's buttons. Larger screens otherwise: top-right, below the header
      position={atTop ? 'top-right' : 'bottom-center'}
      toastOptions={{
        // Glass overlay material (src/styles/tokens.css); inline so it wins over react-hot-toast's own styles
        style: {
          backgroundColor: 'var(--glass-overlay-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-highlight), var(--shadow-overlay)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--fg-1)',
          fontSize: '0.875rem',
          lineHeight: 1.45,
          maxWidth: '26rem',
          padding: '0.5rem 0.25rem 0.5rem 0.75rem',
        },
        // Errors carry the recovery step, so they stay until dismissed
        error: {
          duration: Number.POSITIVE_INFINITY,
        },
        success: {
          duration: 6e3,
        },
      }}
      containerStyle={
        atTop
          ? { top: 'calc(env(safe-area-inset-top) + 5rem)', right: 'calc(env(safe-area-inset-right) + 1rem)' }
          : { bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }
      }
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {t.type !== 'loading' && (
                <IconButton
                  size="small"
                  onClick={() => toast.dismiss(t.id)}
                  aria-label={m.global_toast_dismiss({}, { locale })}
                  title={m.global_toast_dismiss({}, { locale })}
                  className="!self-start !text-fg-2"
                >
                  <IconMdiClose aria-hidden="true" />
                </IconButton>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  )
}