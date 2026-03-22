import { Dialog, Grow, IconButton, SwipeableDrawer } from '@mui/material'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import IconMdiAccount from '~icons/mdi/account-outline'
import IconMdiClose from '~icons/mdi/close'
import IconMdiLogout from '~icons/mdi/logout'
import IconMdiShield from '~icons/mdi/shield-outline'
import { authClient } from '../../../lib/auth-client'
import { useIsLargeDevice } from '../../../utils/breakpoints'
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog'
import { ProfileSection } from './ProfileSection'
import { SecuritySection } from './SecuritySection'

type Section = 'profile' | 'security'

const SECTIONS: { key: Section; icon: FC<{ className?: string }>; labelKey: string }[] = [
  { key: 'profile', icon: IconMdiAccount, labelKey: 'auth:user-profile.profile' },
  { key: 'security', icon: IconMdiShield, labelKey: 'auth:user-profile.security' },
]

const TRANSITION = { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const }

const ModalContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation(['auth'])
  const [activeSection, setActiveSection] = useState<Section>('profile')
  const [direction, setDirection] = useState(0)
  const isLargeDevice = useIsLargeDevice()
  const { data: sessionData } = authClient.useSession()
  const confirmLogout = useConfirmDialog()

  const handleSectionChange = (section: Section) => {
    const currentIdx = SECTIONS.findIndex((s) => s.key === activeSection)
    const nextIdx = SECTIONS.findIndex((s) => s.key === section)
    setDirection(nextIdx > currentIdx ? 1 : -1)
    setActiveSection(section)
  }

  const handleLogout = async () => {
    const confirmed = await confirmLogout.confirm()
    if (!confirmed) return
    await authClient.signOut()
    toast.success(t('auth:logout.toast-success'), { id: 'logout-success' })
    onClose()
  }

  const sidebar = (
    <div
      className={clsx(
        'flex flex-col gap-6 bg-zinc-50 dark:bg-zinc-900/60',
        isLargeDevice ? 'w-56 shrink-0 p-6 pr-4 justify-between' : 'flex-row gap-2 p-3 pb-2',
      )}
    >
      <div className={clsx('flex flex-col gap-4', !isLargeDevice && 'flex-row gap-2 flex-1')}>
        {isLargeDevice && <h1 className="text-xl font-bold m-0 px-3">{t('auth:user-profile.title')}</h1>}
        <div className={clsx('flex flex-col gap-0.5', !isLargeDevice && 'flex-row gap-1')}>
          {SECTIONS.map(({ key, icon: Icon, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSectionChange(key)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border-none bg-transparent w-full text-left',
                activeSection === key
                  ? 'bg-zinc-200/70 dark:bg-zinc-700/70 text-zinc-900 dark:text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300',
                !isLargeDevice && 'flex-1 justify-center',
              )}
            >
              <Icon className="text-base" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {isLargeDevice && (
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent w-full text-left"
        >
          <IconMdiLogout className="text-base" />
          <span>{t('auth:logout.label')}</span>
        </button>
      )}
    </div>
  )

  const slideVariants = {
    enter: (dir: number) => ({ y: dir > 0 ? 20 : -20, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (dir: number) => ({ y: dir > 0 ? -20 : 20, opacity: 0 }),
  }

  const content = (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8 relative">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={activeSection}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={TRANSITION}
        >
          {activeSection === 'profile' && <ProfileSection />}
          {activeSection === 'security' && <SecuritySection currentSessionToken={sessionData?.session?.token} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )

  return (
    <>
      <ConfirmDialog
        open={confirmLogout.open}
        title={t('auth:logout.confirm-title')}
        description={t('auth:logout.confirm-description')}
        confirmLabel={t('auth:user-profile.confirm-ok')}
        cancelLabel={t('auth:user-profile.confirm-cancel')}
        onConfirm={confirmLogout.onConfirm}
        onCancel={confirmLogout.onCancel}
      />

      {/* Close button */}
      <IconButton onClick={onClose} className="!absolute !top-2 !right-2 !z-10" size="small">
        <IconMdiClose className="text-lg" />
      </IconButton>

      {isLargeDevice ? (
        <div className="flex h-[min(36rem,80vh)]">
          {sidebar}
          {content}
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {sidebar}
          {content}
          {/* Mobile logout at bottom */}
          <div className="p-3 pt-0">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer border-none bg-transparent"
            >
              <IconMdiLogout className="text-base" />
              <span>{t('auth:logout.label')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export const UserProfileModal: FC<{
  open: boolean
  onClose: () => void
}> = ({ open, onClose }) => {
  const isLargeDevice = useIsLargeDevice()

  if (isLargeDevice) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        TransitionComponent={Grow}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: '52rem',
            maxWidth: 'calc(100vw - 2rem)',
            borderRadius: '0.75rem',
            overflow: 'hidden',
          },
        }}
      >
        <ModalContent onClose={onClose} />
      </Dialog>
    )
  }

  return (
    <SwipeableDrawer
      disableDiscovery
      disableSwipeToOpen
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      sx={{
        '& .MuiDrawer-paper': {
          height: 'calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)',
          borderRadius: '0.75rem 0.75rem 0 0',
        },
      }}
    >
      <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 my-3" />
      <div className="overflow-hidden h-full pb-[env(safe-area-inset-bottom)]">
        <ModalContent onClose={onClose} />
      </div>
    </SwipeableDrawer>
  )
}