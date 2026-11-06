import { IconButton } from '@mui/material'
import IconMdiClose from '~icons/mdi/close'
import type { FC } from 'react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'

export const CustomizedToaster: FC = () => {
  return (
    <Toaster
      toastOptions={{
        // react-hot-toast paints a white bar inline; dark mode swaps it for the overlay glass
        className:
          'font-bold pr-1 py-2 rounded-xl dark:!bg-[var(--glass-overlay-bg)] dark:!text-[var(--fg-1)] dark:[backdrop-filter:var(--glass-blur)] dark:border dark:border-solid dark:border-[var(--glass-border)]',
        error: {
          duration: 10e3,
        },
        success: {
          duration: 5e3,
        },
      }}
      containerStyle={{
        marginTop: 'calc(env(safe-area-inset-top) + 1rem)',
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {t.type !== 'loading' && (
                <IconButton size="small" onClick={() => toast.dismiss(t.id)}>
                  <IconMdiClose />
                </IconButton>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  )
}