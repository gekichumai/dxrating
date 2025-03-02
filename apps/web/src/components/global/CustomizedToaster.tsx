import { IconButton } from '@mui/material'
import IconMdiClose from '~icons/mdi/close'
import type { FC } from 'react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'

export const CustomizedToaster: FC = () => {
  return (
    <Toaster
      toastOptions={{
        className: 'font-bold pr-1 py-2 rounded-xl',
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
