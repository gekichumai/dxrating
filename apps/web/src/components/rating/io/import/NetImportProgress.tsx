import { Button, ClickAwayListener } from '@mui/material'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useId, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiCheck from '~icons/mdi/check'
import IconMdiExclamation from '~icons/mdi/exclamation'
import IconMdiCogOutline from '~icons/mdi/cog-outline'
import { useNetImportSettings } from './NetImportSettingsContext'
import { netImportProgress, type NetImportProgress as Progress } from './netImportProgressStore'

const prefix = 'rating-calculator:io.import.net-records.'

export function NetImportProgress() {
  const progress = useSyncExternalStore(
    netImportProgress.subscribe,
    netImportProgress.getSnapshot,
    netImportProgress.getServerSnapshot,
  )
  return progress ? <FloatingImportProgress progress={progress} /> : null
}

function FloatingImportProgress({ progress }: { progress: Progress }) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { openSettings } = useNetImportSettings()
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const titleId = useId()
  const percent = Math.round(Math.min(1, Math.max(0, progress.progress)) * 100)
  const running = progress.status === 'running'
  const statusText = t(`${prefix}floating.${progress.status}`)
  const transition = reducedMotion ? { duration: 0 } : { type: 'spring' as const, duration: 0.35, bounce: 0 }
  const collapse = () => {
    setExpanded(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  return (
    <ClickAwayListener onClickAway={() => setExpanded(false)}>
      <motion.div
        layoutRoot
        className="fixed z-[1200] w-0"
        style={{
          // Docked above the bottom edge, not over the header and its sign-in and info buttons
          bottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
          right: 'calc(env(safe-area-inset-right) + 1rem)',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded) {
            event.stopPropagation()
            collapse()
          }
        }}
      >
        <output className="sr-only">{statusText}</output>
        <motion.div
          layout={!reducedMotion}
          initial={false}
          transition={transition}
          className="glass-overlay absolute bottom-0 right-0 overflow-hidden text-fg-1"
          style={{
            width: expanded
              ? 'min(360px, calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 2rem))'
              : 56,
            borderRadius: expanded ? 'var(--radius-xl)' : 28,
          }}
        >
          <motion.div
            layout="position"
            transition={transition}
            className={`relative flex h-14 items-center justify-end ${expanded ? 'pr-2' : ''}`}
          >
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="title"
                  id={titleId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.12 }}
                  className="absolute left-4 right-16 text-sm font-bold"
                >
                  {statusText}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              ref={triggerRef}
              layout="position"
              transition={transition}
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={`${t(`${prefix}floating.${expanded ? 'collapse' : 'expand'}`)} — ${statusText}${running ? ` ${percent}%` : ''}`}
              aria-expanded={expanded}
              aria-controls={expanded ? panelId : undefined}
              className={`relative flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-accent-strong hover:bg-accent-subtle focus-visible:outline-offset-[-4px] rounded-full ${expanded ? 'size-12' : 'size-14'}`}
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 36 36"
                aria-hidden="true"
                className={
                  progress.status === 'error'
                    ? 'text-danger'
                    : progress.status === 'success'
                      ? 'text-status-positive'
                      : ''
                }
              >
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.14" />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="100"
                  transform="rotate(-90 18 18)"
                  initial={false}
                  animate={{ strokeDashoffset: 100 - percent }}
                  transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeOut' }}
                />
              </svg>
              {progress.status === 'success' && (
                <IconMdiCheck aria-hidden="true" className="absolute size-4 text-status-positive" />
              )}
              {progress.status === 'error' && (
                <IconMdiExclamation aria-hidden="true" className="absolute size-4 text-danger" />
              )}
            </motion.button>
          </motion.div>
          <AnimatePresence initial={false} mode="popLayout">
            {expanded && (
              <motion.section
                key="panel"
                id={panelId}
                aria-labelledby={titleId}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ ...transition, opacity: { duration: reducedMotion ? 0 : 0.12 } }}
                className="px-4 pb-4 overflow-y-auto"
                style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 6rem)' }}
              >
                {running ? (
                  <div className="pb-4">
                    <div className="flex items-center justify-between gap-3 pb-3">
                      <output className="text-sm text-secondary">
                        {t(`${prefix}floating.stage.${progress.stage.replaceAll(':', '-')}`)}
                      </output>
                      <span className="shrink-0 text-xl leading-6 font-bold display-num">
                        {percent}
                        <span className="text-sm text-secondary">%</span>
                      </span>
                    </div>
                    <progress aria-label={statusText} value={percent} max={100} className="sr-only" />
                    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-accent-subtle">
                      <motion.div
                        className="h-full origin-left rounded-full bg-accent-strong"
                        initial={false}
                        animate={{ scaleX: percent / 100 }}
                        transition={{ duration: reducedMotion ? 0 : 0.3 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pb-4 text-sm leading-relaxed">{progress.message}</div>
                )}
                <Button
                  fullWidth
                  startIcon={<IconMdiCogOutline />}
                  aria-haspopup="dialog"
                  // MUI's grey scale does not follow the theme: an inset glass fill on the dark theme instead of near-white
                  className="dark:!bg-[var(--glass-inset-bg)] dark:hover:!bg-[rgb(255_255_255/0.1)]"
                  sx={{
                    minHeight: 44,
                    justifyContent: 'flex-start',
                    px: 1.5,
                    borderRadius: '8px',
                    backgroundColor: 'grey.50',
                    '&:hover': { backgroundColor: 'grey.100' },
                  }}
                  onClick={() => {
                    collapse()
                    openSettings(triggerRef.current)
                  }}
                >
                  {t(`${prefix}settings.title`)}
                </Button>
                {!running && (
                  <Button fullWidth sx={{ mt: 1, minHeight: 44 }} onClick={() => netImportProgress.update(null)}>
                    {t(`${prefix}dialog.actions.close`)}
                  </Button>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </ClickAwayListener>
  )
}