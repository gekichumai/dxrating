import { Alert, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconEye, IconShieldCheck } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdministratorCandidateSearch,
  type AdministratorCandidate,
} from '../administrators/administrator-candidate-search'
import { AdministratorRoleControls } from '../administrators/administrator-role-controls'
import { AdministratorRoleHistory } from '../administrators/administrator-role-history'
import { AdministratorRosterTable, type AdministratorRosterRow } from '../administrators/administrator-roster-table'
import {
  changeAdministratorHistoryCursor,
  selectAdministratorHistory,
  validateAdministratorRouteSearch,
} from '../administrators/administrator-route-search'
import { canManageAdministrators } from '../auth/admin-capabilities'
import { useAdminAuth } from '../auth/admin-auth-context'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { administratorRosterQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import classes from './administrators-route.module.css'

const administratorsRouteApi = getRouteApi('/require-admin/workspace/admin-shell/administrators')

export const AdministratorsRoute = () => {
  const { locale, t } = useAdminTranslation()
  const auth = useAdminAuth()
  const data = useAdminData()
  const search = validateAdministratorRouteSearch(administratorsRouteApi.useSearch())
  const navigate = useNavigate({ from: '/administrators' })
  const roster = useQuery(administratorRosterQueryOptions(data))
  const [grantTarget, setGrantTarget] = useState<AdministratorCandidate>()
  const [revokeTargetUserId, setRevokeTargetUserId] = useState<string>()

  useEffect(() => {
    if (!revokeTargetUserId || roster.isFetching || !roster.data) return
    const remainsEligible = roster.data.items.some(
      (administrator) =>
        administrator.userId === revokeTargetUserId &&
        administrator.effectiveRole === 'admin' &&
        administrator.roleSource === 'database',
    )
    if (!remainsEligible) setRevokeTargetUserId(undefined)
  }, [revokeTargetUserId, roster.data, roster.isFetching])

  if (auth.status !== 'authenticated') return null

  const managementAllowed = canManageAdministrators(auth.principal)
  const revokeTarget = roster.data?.items.find(
    (administrator): administrator is AdministratorRosterRow & { effectiveRole: 'admin'; roleSource: 'database' } =>
      administrator.userId === revokeTargetUserId &&
      administrator.effectiveRole === 'admin' &&
      administrator.roleSource === 'database',
  )
  const dateTimeLabels = { local: t('users.datetime.local'), utc: t('users.datetime.utc') }
  const openHistory = (userId: string) => {
    setGrantTarget((current) => (current?.userId === userId ? current : undefined))
    setRevokeTargetUserId((current) => (current === userId ? current : undefined))
    void navigate({ search: selectAdministratorHistory(userId) })
  }
  const changeHistoryCursor = (cursor: string | undefined) => {
    void navigate({ search: changeAdministratorHistoryCursor(search, cursor) })
  }
  const requestRevoke = (target: AdministratorRosterRow) => {
    setGrantTarget(undefined)
    setRevokeTargetUserId(target.userId)
    openHistory(target.userId)
  }

  const roleControlLabels = {
    title: t('administrators.actions.title'),
    reasonLabel: t('administrators.actions.reason.label'),
    reasonDescription: t('administrators.actions.reason.description'),
    reasonRequired: t('administrators.actions.reason.required'),
    reasonTooLong: t('administrators.actions.reason.tooLong'),
    grantAction: t('administrators.actions.grant'),
    revokeAction: t('administrators.actions.revoke'),
    grantWarning: t('administrators.actions.grantWarning'),
    revokeWarning: t('administrators.actions.revokeWarning'),
    targetUserLabel: t('administrators.actions.targetUser'),
    confirmGrantTitle: t('administrators.actions.confirmGrantTitle'),
    confirmGrantDescription: t('administrators.actions.confirmGrantDescription'),
    confirmGrantAction: t('administrators.actions.confirmGrant'),
    confirmRevokeTitle: t('administrators.actions.confirmRevokeTitle'),
    confirmRevokeDescription: t('administrators.actions.confirmRevokeDescription'),
    confirmRevokeAction: t('administrators.actions.confirmRevoke'),
    cancelAction: t('administrators.actions.cancel'),
    verificationRequired: t('administrators.actions.verification.required'),
    verificationCancelled: t('administrators.actions.verification.cancelled'),
    verificationCompleteRetry: t('administrators.actions.verification.completeRetry'),
    verifyIdentityAction: t('administrators.actions.verifyIdentity'),
    retryAction: t('administrators.actions.retry'),
    conflictError: t('administrators.actions.errors.conflict'),
    forbiddenError: t('administrators.actions.errors.forbidden'),
    genericError: t('administrators.actions.errors.generic'),
    refreshAction: t('administrators.actions.refresh'),
    disabledCapability: t('administrators.actions.disabledCapability'),
    disabledSelf: t('administrators.actions.disabledSelf'),
    disabledDeployment: t('administrators.actions.disabledDeployment'),
    disabledSuperAdmin: t('administrators.actions.disabledSuperAdmin'),
    invalidGrantTarget: t('administrators.actions.invalidGrantTarget'),
    invalidRevokeTarget: t('administrators.actions.invalidRevokeTarget'),
    grantSuccessNotification: t('administrators.actions.success.grant'),
    revokeSuccessNotification: t('administrators.actions.success.revoke'),
  }
  const rosterLabels = {
    caption: t('administrators.roster.caption'),
    tableRegion: t('administrators.roster.tableRegion'),
    loading: t('administrators.roster.loading'),
    emptyTitle: t('administrators.roster.emptyTitle'),
    emptyDescription: t('administrators.roster.emptyDescription'),
    columns: {
      identity: t('administrators.roster.columns.identity'),
      email: t('administrators.roster.columns.email'),
      accountStatus: t('administrators.roster.columns.accountStatus'),
      roleAndSource: t('administrators.roster.columns.roleAndSource'),
      actions: t('administrators.roster.columns.actions'),
    },
    userId: t('administrators.roster.userId'),
    email: {
      verified: t('administrators.roster.email.verified'),
      notVerified: t('administrators.roster.email.notVerified'),
    },
    roles: {
      administrator: t('administrators.roster.roles.administrator'),
      superAdministrator: t('administrators.roster.roles.superAdministrator'),
    },
    sources: {
      database: t('administrators.roster.sources.database'),
      deployment: t('administrators.roster.sources.deployment'),
      databaseDescription: t('administrators.roster.sources.databaseDescription'),
      deploymentDescription: t('administrators.roster.sources.deploymentDescription'),
      immutable: t('administrators.roster.sources.immutable'),
    },
    statuses: {
      active: t('administrators.roster.status.active'),
      temporarilyBanned: t('administrators.roster.status.temporarilyBanned'),
      permanentlyBanned: t('administrators.roster.status.permanentlyBanned'),
      expiresAt: t('administrators.roster.status.expiresAt'),
    },
    openHistory: t('administrators.roster.openHistory'),
    revoke: t('administrators.roster.revoke'),
    dateTime: dateTimeLabels,
  }

  return (
    <Stack className={classes.root} gap="xl">
      <Group align="flex-end" className={classes.intro} gap="lg" justify="space-between">
        <Text c="dimmed" maw={780}>
          {t('page.administrators.description')}
        </Text>
        <OperationalRefresh
          dataUpdatedAt={roster.dataUpdatedAt}
          isFetching={roster.isFetching}
          onRefresh={roster.refetch}
        />
      </Group>

      <Alert
        color={managementAllowed ? 'indigo' : 'blue'}
        icon={
          managementAllowed ? (
            <IconShieldCheck aria-hidden="true" size={20} />
          ) : (
            <IconEye aria-hidden="true" size={20} />
          )
        }
        title={t(managementAllowed ? 'administrators.management.title' : 'administrators.readOnly.title')}
        variant="light"
      >
        {t(managementAllowed ? 'administrators.management.description' : 'administrators.readOnly.description')}
      </Alert>

      <Stack gap="md">
        <Group className={classes.sectionHeader} justify="space-between" wrap="wrap">
          <Title order={2} size="h3">
            {t('administrators.roster.caption')}
          </Title>
          {roster.data ? (
            <Text c="dimmed" size="sm">
              {t('administrators.roster.count', { count: roster.data.items.length })}
            </Text>
          ) : null}
        </Group>

        {roster.error ? <AdminErrorNotice error={roster.error} onRetry={() => void roster.refetch()} /> : null}

        {roster.isPending || roster.data ? (
          managementAllowed ? (
            <AdministratorRosterTable
              canManageAdministrators
              labels={rosterLabels}
              loading={roster.isPending}
              locale={locale}
              onOpenRoleHistory={openHistory}
              onRequestRevoke={requestRevoke}
              rows={roster.data?.items ?? []}
            />
          ) : (
            <AdministratorRosterTable
              canManageAdministrators={false}
              labels={rosterLabels}
              loading={roster.isPending}
              locale={locale}
              onOpenRoleHistory={openHistory}
              rows={roster.data?.items ?? []}
            />
          )
        ) : null}
      </Stack>

      <SimpleGrid className={classes.managementGrid} cols={{ base: 1, xl: revokeTarget ? 2 : 1 }} spacing="lg">
        <AdministratorRoleHistory
          cursor={search.historyCursor}
          labels={{
            title: t('administrators.history.title'),
            selectSubject: t('administrators.history.selectSubject'),
            loading: t('administrators.history.loading'),
            empty: t('administrators.history.empty'),
            chronology: t('administrators.history.chronology'),
            grant: t('administrators.history.grant'),
            revoke: t('administrators.history.revoke'),
            actorUserId: t('administrators.history.actorUserId'),
            reason: t('administrators.history.reason'),
            changedAt: t('administrators.history.changedAt'),
            backToNewest: t('administrators.history.backToNewest'),
            older: t('administrators.history.older'),
            subjectUserId: t('administrators.history.subjectUserId'),
            dateTime: dateTimeLabels,
          }}
          locale={locale}
          onCursorChange={changeHistoryCursor}
          userId={search.userId}
        />

        {managementAllowed && revokeTarget ? (
          <div className={classes.selectedAction}>
            <AdministratorRoleControls
              key={`revoke-${revokeTarget.userId}`}
              labels={roleControlLabels}
              onAuthoritativeMismatch={() => setRevokeTargetUserId(undefined)}
              onSuccess={() => setRevokeTargetUserId(undefined)}
              principal={auth.principal}
              target={revokeTarget}
            />
          </div>
        ) : null}
      </SimpleGrid>

      {managementAllowed ? (
        <SimpleGrid className={classes.managementGrid} cols={{ base: 1, xl: grantTarget ? 2 : 1 }} spacing="lg">
          <AdministratorCandidateSearch
            labels={{
              title: t('administrators.candidates.title'),
              description: t('administrators.candidates.description'),
              existingAccountsOnly: t('administrators.candidates.existingAccountsOnly'),
              formLabel: t('administrators.candidates.formLabel'),
              searchBy: t('administrators.candidates.searchBy'),
              searchByUserId: t('administrators.candidates.searchByUserId'),
              searchByEmail: t('administrators.candidates.searchByEmail'),
              searchByDisplayName: t('administrators.candidates.searchByDisplayName'),
              query: t('administrators.candidates.query'),
              userIdPlaceholder: t('administrators.candidates.userIdPlaceholder'),
              emailPlaceholder: t('administrators.candidates.emailPlaceholder'),
              displayNamePlaceholder: t('administrators.candidates.displayNamePlaceholder'),
              required: t('administrators.candidates.required'),
              invalidUserId: t('administrators.candidates.invalidUserId'),
              invalidEmail: t('administrators.candidates.invalidEmail'),
              invalidDisplayName: t('administrators.candidates.invalidDisplayName'),
              submit: t('administrators.candidates.submit'),
              loading: t('administrators.candidates.loading'),
              empty: t('administrators.candidates.empty'),
              resultsCaption: t('administrators.candidates.resultsCaption'),
              tableRegion: t('administrators.candidates.tableRegion'),
              identity: t('administrators.candidates.identity'),
              email: t('administrators.candidates.email'),
              verification: t('administrators.candidates.verification'),
              verified: t('administrators.candidates.verified'),
              notVerified: t('administrators.candidates.notVerified'),
              select: t('administrators.candidates.select'),
              selected: t('administrators.candidates.selected'),
              backToNewest: t('administrators.candidates.backToNewest'),
              older: t('administrators.candidates.older'),
            }}
            onSelect={(candidate) => {
              setRevokeTargetUserId(undefined)
              setGrantTarget(candidate)
              openHistory(candidate.userId)
            }}
            onSelectionInvalidated={() => setGrantTarget(undefined)}
            selectedUserId={grantTarget?.userId}
          />

          {grantTarget ? (
            <div className={classes.selectedAction}>
              <AdministratorRoleControls
                key={`grant-${grantTarget.userId}`}
                labels={roleControlLabels}
                onAuthoritativeMismatch={() => setGrantTarget(undefined)}
                onSuccess={() => {
                  openHistory(grantTarget.userId)
                  setGrantTarget(undefined)
                }}
                principal={auth.principal}
                target={grantTarget}
              />
            </div>
          ) : null}
        </SimpleGrid>
      ) : null}
    </Stack>
  )
}