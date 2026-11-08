import { Dialog, Fade, Grow, IconButton, SwipeableDrawer, useMediaQuery } from '@mui/material'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import IconMdiAccount from '~icons/mdi/account-outline'
import IconMdiClose from '~icons/mdi/close'
import IconMdiLogout from '~icons/mdi/logout'
import IconMdiLinkVariant from '~icons/mdi/link-variant'
import IconMdiShield from '~icons/mdi/shield-outline'
import IconMdiCloudOutline from '~icons/mdi/cloud-outline'
import { CloudSaveSection } from '../../cloud-save/CloudSaveSection'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { authClient } from '../../../lib/auth-client'
import { useActiveSave } from '@/models/scores/ActiveSaveContext'
import { useIsLargeDevice } from '../../../utils/breakpoints'
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog'
import { ConnectedAccountsSection } from './ConnectedAccountsSection'
import { ProfileSection } from './ProfileSection'
import { SecuritySection } from './SecuritySection'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

type Section = 'profile' | 'accounts' | 'security' | 'cloud-save'

const SECTIONS: { key: Section; icon: FC<{ className?: string }>; label: PlainMessage }[] = [
  { key: 'profile', icon: IconMdiAccount, label: m.auth_userProfile_profile },
  { key: 'accounts', icon: IconMdiLinkVariant, label: m.auth_userProfile_accounts_title },
  { key: 'security', icon: IconMdiShield, label: m.auth_userProfile_security },
]

// Only while a cloud save is active
const CLOUD_SAVE_SECTION = {
  key: 'cloud-save' as const,
  icon: IconMdiCloudOutline,
  label: m.ratingCalculator_cloudSave_title,
}

// A section switch is a frequent interaction: short, on --ease-out. Under reduced motion MotionConfig (theme
// provider) drops the y offset and keeps the fade
const TRANSITION = { duration: 0.15, ease: [0.2, 0, 0, 1] as const }

export const USER_PROFILE_TITLE_ID = 'user-profile-dialog-title'

// Section switcher rows: md radius; the selected one is a raised inset glass row in semibold with an accent bar,
// so the state doesn't rest on the fill alone
const NAV_ITEM_CLASS =
  'relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors duration-150 cursor-pointer border border-solid w-full text-left'

const ModalContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const locale = useLocale()
  const cloudSave = useCloudSaveUi()
  const sections = cloudSave ? [...SECTIONS, CLOUD_SAVE_SECTION] : SECTIONS
  const [selectedSection, setActiveSection] = useState<Section>('profile')
  // The cloud save section goes away with the cloud save
  const activeSection = sections.some((section) => section.key === selectedSection) ? selectedSection : 'profile'
  const [direction, setDirection] = useState(0)
  const isLargeDevice = useIsLargeDevice()
  const { data: sessionData } = authClient.useSession()
  const confirmLogout = useConfirmDialog()
  const activeSave = useActiveSave()

  const handleSectionChange = (section: Section) => {
    const currentIdx = sections.findIndex((s) => s.key === activeSection)
    const nextIdx = sections.findIndex((s) => s.key === section)
    setDirection(nextIdx > currentIdx ? 1 : -1)
    setActiveSection(section)
  }

  const handleLogout = async () => {
    const confirmed = await confirmLogout.confirm()
    if (!confirmed) return
    // A cloud save sends what it still has while the session is valid (at most 3 s); the rest stays queued
    await activeSave.flushBeforeSignOut()
    await authClient.signOut()
    toast.success(m.auth_logout_toastSuccess({}, { locale }), { id: 'logout-success' })
    onClose()
  }

  const title = (
    <h2 id={USER_PROFILE_TITLE_ID} className="text-xl font-semibold leading-tight text-fg-1 m-0">
      {m.auth_userProfile_title({}, { locale })}
    </h2>
  )

  const closeButton = (
    <IconButton
      onClick={onClose}
      size="small"
      aria-label={m.auth_userProfile_close({}, { locale })}
      title={m.auth_userProfile_close({}, { locale })}
      className="!text-fg-2 !shrink-0"
    >
      <IconMdiClose className="text-lg" aria-hidden="true" />
    </IconButton>
  )

  const sidebar = (
    // Transparent on the dialog's glass, separated from the content by a hairline instead of a grey fill
    <div
      className={clsx(
        'flex flex-col gap-6',
        isLargeDevice
          ? 'w-56 shrink-0 p-6 pr-4 justify-between border-0 border-r border-solid border-black/8'
          : 'gap-3 px-4 pb-3',
      )}
    >
      <div className={clsx('flex flex-col gap-4', !isLargeDevice && 'gap-3')}>
        {isLargeDevice ? (
          <div className="px-3">{title}</div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">{title}</div>
            {closeButton}
          </div>
        )}
        <nav aria-label={m.auth_userProfile_sections({}, { locale })}>
          <ul className={clsx('m-0 p-0 list-none flex flex-col gap-0.5', !isLargeDevice && 'flex-row gap-1')}>
            {sections.map(({ key, icon: Icon, label }) => {
              const selected = activeSection === key
              return (
                <li key={key} className={clsx(!isLargeDevice && 'flex-1 min-w-0')}>
                  <button
                    type="button"
                    onClick={() => handleSectionChange(key)}
                    // A section of this dialog, not a page, so the current item is `true`
                    aria-current={selected ? 'true' : undefined}
                    className={clsx(
                      NAV_ITEM_CLASS,
                      selected
                        ? 'glass-inset shadow-[var(--shadow-1)] font-semibold text-fg-1'
                        : 'border-transparent bg-transparent text-fg-2 hover:bg-black/4 hover:text-fg-1',
                      !isLargeDevice && 'justify-center !gap-2 !px-2',
                    )}
                  >
                    {/* The accent bar marks the selected section alongside the weight change */}
                    {selected && isLargeDevice && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent-strong"
                      />
                    )}
                    <Icon className="text-base shrink-0" aria-hidden="true" />
                    <span className="truncate">{label({}, { locale })}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>

      {isLargeDevice && (
        // Signing out is reversible and loses nothing, so it is a neutral action rather than a red one
        <button
          type="button"
          onClick={handleLogout}
          className={clsx(
            NAV_ITEM_CLASS,
            'border-transparent bg-transparent text-fg-2 hover:bg-black/4 hover:text-fg-1',
          )}
        >
          <IconMdiLogout className="text-base shrink-0" aria-hidden="true" />
          <span>{m.auth_logout_label({}, { locale })}</span>
        </button>
      )}
    </div>
  )

  const slideVariants = {
    enter: (dir: number) => ({ y: dir > 0 ? 8 : -8, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (dir: number) => ({ y: dir > 0 ? -8 : 8, opacity: 0 }),
  }

  const content = (
    <div
      className={clsx('flex-1 overflow-y-auto overscroll-contain relative', isLargeDevice ? 'p-8 pt-12' : 'p-4 pt-1')}
    >
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
          {activeSection === 'profile' && <ProfileSection idPrefix="account-dialog" />}
          {activeSection === 'accounts' && <ConnectedAccountsSection />}
          {activeSection === 'cloud-save' && <CloudSaveSection />}
          {activeSection === 'security' && (
            <SecuritySection currentSessionToken={sessionData?.session?.token} idPrefix="account-dialog" titleAs="h3" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )

  return (
    <>
      <ConfirmDialog
        open={confirmLogout.open}
        title={m.auth_logout_confirmTitle({}, { locale })}
        description={m.auth_logout_confirmDescription({}, { locale })}
        confirmLabel={m.auth_logout_confirmButton({}, { locale })}
        cancelLabel={m.auth_userProfile_confirmCancel({}, { locale })}
        onConfirm={confirmLogout.onConfirm}
        onCancel={confirmLogout.onCancel}
      />

      {isLargeDevice && <div className="absolute top-3 end-3 z-10">{closeButton}</div>}

      {isLargeDevice ? (
        <div className="flex h-[min(36rem,80dvh)]">
          {sidebar}
          {content}
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {sidebar}
          {content}
          {/* Mobile logout at bottom */}
          <div className="px-4 pt-2 pb-3 border-0 border-t border-solid border-black/8">
            <button
              type="button"
              onClick={handleLogout}
              className={clsx(NAV_ITEM_CLASS, 'justify-center !gap-2 glass-inset text-fg-1 hover:bg-accent-subtle')}
            >
              <IconMdiLogout className="text-base" aria-hidden="true" />
              <span>{m.auth_logout_label({}, { locale })}</span>
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
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  if (isLargeDevice) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        TransitionComponent={reducedMotion ? Fade : Grow}
        maxWidth={false}
        aria-labelledby={USER_PROFILE_TITLE_ID}
        PaperProps={{
          sx: {
            width: '52rem',
            maxWidth: 'calc(100vw - 2rem)',
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
      transitionDuration={reducedMotion ? 150 : undefined}
      sx={{
        '& .MuiDrawer-paper': {
          height: 'calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)',
        },
      }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': USER_PROFILE_TITLE_ID,
      }}
    >
      <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-black/15 my-3" aria-hidden="true" />
      <div className="overflow-hidden h-full pb-[env(safe-area-inset-bottom)]">
        <ModalContent onClose={onClose} />
      </div>
    </SwipeableDrawer>
  )
}