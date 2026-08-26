import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { IconChevronDown, IconLogout, IconMoon, IconSun } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Suspense, useEffect, useRef, type KeyboardEvent } from 'react'
import { canAccessAdminDestination, getAdministratorRoleLabelKey } from '../auth/admin-capabilities'
import { useAdminAuth, useAdminAuthActions } from '../auth/admin-auth-context'
import { useAdminTranslation } from '../i18n'
import { ADMIN_DESTINATIONS, getAdminDestination } from '../navigation'
import { RouteLoading } from './route-states'
import classes from './admin-shell.module.css'

export const resolveEnvironmentLabel = ({
  MODE,
  VITE_ADMIN_ENVIRONMENT,
}: Pick<ImportMetaEnv, 'MODE' | 'VITE_ADMIN_ENVIRONMENT'>): string | undefined => {
  if (MODE === 'production') return undefined
  return VITE_ADMIN_ENVIRONMENT?.trim() || MODE
}

const ColorSchemeControl = () => {
  const { t } = useAdminTranslation()
  const { setColorScheme } = useMantineColorScheme()
  const colorScheme = useComputedColorScheme('light', {
    getInitialValueInEffect: true,
  })
  const dark = colorScheme === 'dark'
  const label = t(dark ? 'shell.switchToLight' : 'shell.switchToDark')

  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        className={classes.controlButton}
        onClick={() => setColorScheme(dark ? 'light' : 'dark')}
        radius="md"
        size={42}
        variant="subtle"
      >
        <span aria-hidden="true" className={classes.schemeIconFrame}>
          <IconSun className={dark ? classes.schemeIconHidden : classes.schemeIconVisible} size={20} stroke={1.8} />
          <IconMoon className={dark ? classes.schemeIconVisible : classes.schemeIconHidden} size={20} stroke={1.8} />
        </span>
      </ActionIcon>
    </Tooltip>
  )
}

export const AdminShell = () => {
  const { t } = useAdminTranslation()
  const location = useLocation()
  const [mobileOpened, { close: closeMobile, toggle: toggleMobile }] = useDisclosure(false)
  const compactNavigation = useMediaQuery('(max-width: 61.99em)')
  const burgerRef = useRef<HTMLButtonElement>(null)
  const navigationRef = useRef<HTMLDivElement>(null)
  const previousPathname = useRef(location.pathname)
  const destination = getAdminDestination(location.pathname)
  const environment = resolveEnvironmentLabel(import.meta.env)
  const auth = useAdminAuth()
  const authActions = useAdminAuthActions()

  useEffect(() => {
    document.title = `${t(destination.titleKey)} · ${t('app.name')}`
    if (previousPathname.current !== location.pathname) {
      closeMobile()
      document.getElementById('admin-page-title')?.focus()
      previousPathname.current = location.pathname
    }
  }, [closeMobile, destination.titleKey, location.pathname, t])

  useEffect(() => {
    if (compactNavigation && mobileOpened) {
      navigationRef.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus()
    }
  }, [compactNavigation, mobileOpened])

  if (auth.status !== 'authenticated') return null

  const visibleDestinations = ADMIN_DESTINATIONS.filter((item) => {
    if (item.id === 'administrators' || item.id === 'comments' || item.id === 'users') {
      return canAccessAdminDestination(auth.principal, item.id)
    }
    return true
  })

  const handleNavigationKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !compactNavigation || !mobileOpened) return
    event.preventDefault()
    closeMobile()
    burgerRef.current?.focus()
  }

  const navigationHidden = Boolean(compactNavigation && !mobileOpened)

  return (
    <>
      <Anchor className={classes.skipLink} href="#admin-main-content">
        {t('shell.skipToContent')}
      </Anchor>
      <AppShell
        className={classes.appShell}
        header={{ height: 68 }}
        navbar={{
          width: 272,
          breakpoint: 'md',
          collapsed: { mobile: !mobileOpened },
        }}
        padding={{ base: 'md', sm: 'xl' }}
      >
        <AppShell.Header className={classes.header}>
          <Group className={classes.headerContent} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              {compactNavigation ? (
                <Burger
                  aria-controls="admin-primary-navigation"
                  aria-expanded={mobileOpened}
                  aria-label={t(mobileOpened ? 'shell.closeNavigation' : 'shell.openNavigation')}
                  className={classes.controlButton}
                  onClick={toggleMobile}
                  opened={mobileOpened}
                  ref={burgerRef}
                  size="sm"
                />
              ) : null}
              <Box className={classes.wordmark}>
                <Text fw={750} lh={1} size="lg">
                  {t('app.name')}
                </Text>
                <Text c="dimmed" className={classes.wordmarkTagline} size="xs">
                  {t('app.tagline')}
                </Text>
              </Box>
              {environment ? (
                <Badge aria-label={t('environment.badge', { environment })} color="orange" variant="light">
                  {environment}
                </Badge>
              ) : null}
            </Group>

            <Group gap="xs" wrap="nowrap">
              <ColorSchemeControl />
              <Menu position="bottom-end" shadow="md" width={250}>
                <Menu.Target>
                  <UnstyledButton
                    aria-label={t('shell.currentUserMenu')}
                    className={`${classes.userButton} ${classes.controlButton}`}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="indigo" radius="xl" size={32}>
                        {auth.principal.effectiveRole === 'super_admin' ? 'S' : 'A'}
                      </Avatar>
                      <Box className={classes.userCopy}>
                        <Text fw={650} lh={1.15} size="sm">
                          {auth.principal.userId}
                        </Text>
                        <Text c="dimmed" lh={1.15} size="xs">
                          {t(getAdministratorRoleLabelKey(auth.principal))}
                        </Text>
                      </Box>
                      <IconChevronDown aria-hidden="true" size={16} stroke={1.8} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{t('shell.currentUser')}</Menu.Label>
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout aria-hidden="true" size={17} stroke={1.8} />}
                    onClick={() => void authActions.signOut()}
                  >
                    {t('actions.signOut')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar
          aria-hidden={navigationHidden || undefined}
          aria-label={t('nav.primary')}
          className={classes.navbar}
          id="admin-primary-navigation"
          inert={navigationHidden || undefined}
          onKeyDown={handleNavigationKeyDown}
          p="md"
          ref={navigationRef}
        >
          <AppShell.Section component={ScrollArea} grow>
            <Stack gap={6}>
              {visibleDestinations.map((item) => {
                const active = destination.id === item.id
                const Icon = item.icon
                return (
                  <NavLink
                    active={active}
                    aria-current={active ? 'page' : undefined}
                    className={classes.navLink}
                    component={Link}
                    key={item.id}
                    label={t(item.labelKey)}
                    leftSection={<Icon aria-hidden="true" size={20} stroke={1.7} />}
                    onClick={closeMobile}
                    to={item.to}
                  />
                )
              })}
            </Stack>
          </AppShell.Section>
          <AppShell.Section className={classes.navFooter}>
            <Text c="dimmed" size="xs">
              {t('shell.collapseHint')}
            </Text>
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main className={classes.main} id="admin-main-content" tabIndex={-1}>
          <Box className={classes.pageFrame}>
            <Box component="nav" aria-label={t('breadcrumbs.label')}>
              <Breadcrumbs mb="xs" separator="/" separatorMargin="xs">
                <Anchor component={Link} size="sm" to="/">
                  {t('app.name')}
                </Anchor>
                <Text aria-current="page" c="dimmed" size="sm">
                  {t(destination.labelKey)}
                </Text>
              </Breadcrumbs>
            </Box>
            <Title className={classes.pageTitle} id="admin-page-title" order={1} tabIndex={-1}>
              {t(destination.titleKey)}
            </Title>
            <Suspense fallback={<RouteLoading />}>
              <Outlet />
            </Suspense>
          </Box>
        </AppShell.Main>
      </AppShell>
    </>
  )
}