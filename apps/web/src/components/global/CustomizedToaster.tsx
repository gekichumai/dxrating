import { IconButton, useMediaQuery } from '@mui/material'
import IconMdiClose from '~icons/mdi/close'
import type { FC } from 'react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const CustomizedToaster: FC = () => {
  const locale = useLocale()
  // Same 768px breakpoint as useIsLargeDevice; false on the server and the first client render, so SSR markup matches
  const isLargeDevice = useMediaQuery('(min-width: 768px)')

  return (
    <Toaster
      // Phones: at the bottom, clear of the header's sign-in button. Larger screens: top-right, below the header
      position={isLargeDevice ? 'top-right' : 'bottom-center'}
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
        isLargeDevice
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