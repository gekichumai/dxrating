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
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)', right: 'calc(env(safe-area-inset-right) + 1rem)' }}
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
          className="absolute right-0 overflow-hidden bg-white text-zinc-800"
          style={{
            width: expanded
              ? 'min(360px, calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 2rem))'
              : 56,
            borderRadius: expanded ? 24 : 28,
            boxShadow: '0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 12px rgb(0 0 0 / 0.08), 0 16px 48px rgb(0 0 0 / 0.12)',
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
              className={`relative flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-violet-600 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-violet-600 rounded-full ${expanded ? 'size-12' : 'size-14'}`}
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 36 36"
                aria-hidden="true"
                className={
                  progress.status === 'error' ? 'text-red-500' : progress.status === 'success' ? 'text-green-600' : ''
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
                <IconMdiCheck aria-hidden="true" className="absolute size-4 text-green-600" />
              )}
              {progress.status === 'error' && (
                <IconMdiExclamation aria-hidden="true" className="absolute size-4 text-red-500" />
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
                      <output className="text-sm text-zinc-500">
                        {t(`${prefix}floating.stage.${progress.stage.replaceAll(':', '-')}`)}
                      </output>
                      <span className="shrink-0 text-xl leading-6 font-bold tabular-nums">
                        {percent}
                        <span className="text-sm text-zinc-400">%</span>
                      </span>
                    </div>
                    <progress aria-label={statusText} value={percent} max={100} className="sr-only" />
                    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                      <motion.div
                        className="h-full origin-left rounded-full bg-violet-500"
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