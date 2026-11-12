import type { Breakpoint } from '@mui/material'
import { Dialog, DialogContent, Fade, Grow, IconButton, SwipeableDrawer, useMediaQuery } from '@mui/material'
import { type FC, type ReactNode, useEffect, useId, useState } from 'react'
import IconMdiClose from '~icons/mdi/close'
import { useIsLargeDevice } from '../../utils/breakpoints'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const ResponsiveDialog: FC<{
  open: boolean
  setOpen: (open: boolean) => void
  maxWidth?: Breakpoint
  disableClose?: boolean
  drawerHeight?: string
  /** Visible heading rendered beside the close button; it also names the dialog */
  title?: ReactNode
  /** Id of a heading inside the content that names the dialog, when the content renders its own */
  labelledBy?: string
  /** The content renders its own close button (e.g. in a header row with other actions), so the shared one is left out */
  hideCloseButton?: boolean
  /** Runs once the close transition has finished and the dialog is off screen */
  onExited?: () => void
  children?: () => ReactNode
}> = ({
  open,
  setOpen,
  maxWidth = 'md',
  disableClose,
  drawerHeight,
  title,
  labelledBy,
  hideCloseButton,
  onExited,
  children,
}) => {
  const locale = useLocale()
  const isLargeDevice = useIsLargeDevice()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const generatedTitleId = useId()
  const titleId = title ? generatedTitleId : labelledBy
  const [internalOpen, setInternalOpen] = useState(false)

  // drawerOpen sets itself to true after internalOpen = true on the next render,
  // and sets itself to false immediately after internalOpen = false
  const [_drawerOpen, _setDrawerOpen] = useState(false)
  useEffect(() => {
    if (internalOpen) {
      _setDrawerOpen(true)
    } else {
      _setDrawerOpen(false)
    }
  }, [internalOpen])
  const drawerOpen = _drawerOpen && open

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        setInternalOpen(true)
      }, 0)
    } else {
      const timeout = setTimeout(() => {
        setInternalOpen(false)
      }, 1000) // Adjust the delay time as needed
      return () => clearTimeout(timeout)
    }
  }, [open])

  const closeButton = (
    <IconButton
      onClick={() => setOpen(false)}
      disabled={disableClose}
      aria-label={m.global_dialog_close({}, { locale })}
      title={m.global_dialog_close({}, { locale })}
      size="small"
      className="!-me-1.5 !shrink-0 !text-fg-2"
    >
      <IconMdiClose aria-hidden="true" />
    </IconButton>
  )

  // With a title, the close button sits on the title's line; without one it gets its own slim row at the end
  const header = (showClose: boolean) =>
    title ? (
      <div className="flex items-start gap-2 mb-3">
        <h2 id={titleId} className="m-0 flex-1 min-w-0 text-xl font-semibold leading-tight text-fg-1 text-balance">
          {title}
        </h2>
        {showClose && closeButton}
      </div>
    ) : showClose ? (
      <div className="flex justify-end -mt-2 mb-1">{closeButton}</div>
    ) : null

  return isLargeDevice ? (
    <>
      {internalOpen && (
        <Dialog
          open={open}
          onClose={() => !disableClose && setOpen(false)}
          maxWidth={maxWidth}
          fullWidth
          TransitionComponent={reducedMotion ? Fade : Grow}
          TransitionProps={{ onExited }}
          aria-labelledby={titleId}
        >
          <DialogContent>
            {header(!hideCloseButton)}
            {children?.()}
          </DialogContent>
        </Dialog>
      )}
    </>
  ) : (
    <>
      {internalOpen && (
        <SwipeableDrawer
          disableDiscovery
          disableSwipeToOpen
          anchor="bottom"
          open={drawerOpen}
          onClose={() => !disableClose && setOpen(false)}
          onOpen={() => setOpen(true)}
          transitionDuration={reducedMotion ? 150 : undefined}
          SlideProps={{ onExited }}
          sx={{
            '& .MuiDrawer-paper': {
              height: drawerHeight ?? 'calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 4rem)',
            },
          }}
          PaperProps={{
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': titleId,
          }}
        >
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-black/15 my-3" aria-hidden="true" />
          <div className="overflow-auto overscroll-contain h-full p-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {/* Swiping down and tapping outside close it too, but not everyone knows that: keep a visible close button */}
            {header(!hideCloseButton)}
            {children?.()}
          </div>
        </SwipeableDrawer>
      )}
    </>
  )
}