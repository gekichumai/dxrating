import { Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowRight, IconRotateClockwise } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { useAdminData } from '../data/admin-data-context'
import { userSearchQueryOptions } from '../data/query-options'
import { useAdminTranslation } from '../i18n'
import { UserSearchForm } from '../users/user-search-form'
import { UserSearchTable } from '../users/user-search-table'
import {
  userListSearchWithoutCursor,
  validateUserListSearch,
  type UserListFilters,
  type UserListSearch,
} from '../users/user-route-search'
import classes from './users-route.module.css'

const usersRouteApi = getRouteApi('/require-admin/workspace/admin-shell/users')

export const UsersRoute = () => {
  const { t } = useAdminTranslation()
  const data = useAdminData()
  const search = validateUserListSearch(usersRouteApi.useSearch())
  const navigate = useNavigate({ from: '/users' })
  const users = useQuery(userSearchQueryOptions(data, search))
  const rows = users.data?.items ?? []

  const navigateToSearch = (nextSearch: UserListSearch, replace = false) => {
    void navigate({ search: nextSearch, replace })
  }

  const applyFilters = (filters: UserListFilters) => {
    navigateToSearch(filters)
  }

  const restartResults = () => {
    navigateToSearch(userListSearchWithoutCursor(search), true)
  }

  const nextPage = () => {
    if (!users.data?.nextCursor) return
    navigateToSearch({ ...search, cursor: users.data.nextCursor })
  }

  return (
    <Stack className={classes.root} gap="xl">
      <Group align="flex-end" className={classes.intro} gap="lg" justify="space-between">
        <Text c="dimmed" maw={760}>
          {t('page.users.description')}
        </Text>
        <OperationalRefresh
          dataUpdatedAt={users.dataUpdatedAt}
          isFetching={users.isFetching}
          onRefresh={users.refetch}
        />
      </Group>

      <UserSearchForm search={search} onClear={() => navigateToSearch({})} onSubmit={applyFilters} />

      {users.error ? (
        <Stack gap="sm">
          <AdminErrorNotice
            error={users.error}
            onRefresh={search.cursor ? restartResults : undefined}
            onRetry={() => void users.refetch()}
          />
          {search.cursor ? (
            <Group align="center" gap="sm">
              <Text c="dimmed" size="sm">
                {t('users.results.cursorRecovery')}
              </Text>
              <Button
                leftSection={<IconRotateClockwise aria-hidden="true" size={17} />}
                onClick={restartResults}
                size="sm"
                variant="default"
              >
                {t('users.results.restart')}
              </Button>
            </Group>
          ) : null}
        </Stack>
      ) : null}

      <section aria-labelledby="user-search-results-title">
        <Stack gap="md">
          <Group align="center" className={classes.resultsHeader} gap="md" justify="space-between">
            <Text fw={700} id="user-search-results-title" size="lg">
              {t('users.results.caption')}
            </Text>
            {users.data ? (
              <Text c="dimmed" size="sm">
                {t('users.results.count', { count: rows.length })}
              </Text>
            ) : null}
          </Group>

          <Text aria-live="polite" className={classes.liveRegion} component="output">
            {users.isPending ? t('users.results.loading') : users.isFetching ? t('users.results.loadingNext') : ''}
          </Text>

          {users.isPending || users.data ? <UserSearchTable loading={users.isPending} rows={rows} /> : null}

          {users.data && rows.length > 0 ? (
            <Group className={classes.pagination} gap="md" justify="flex-end">
              {users.data.nextCursor ? (
                <Button
                  disabled={users.isFetching}
                  loading={users.isFetching}
                  onClick={nextPage}
                  rightSection={<IconArrowRight aria-hidden="true" size={17} />}
                  variant="default"
                >
                  {t('users.results.next')}
                </Button>
              ) : (
                <Text c="dimmed" size="sm">
                  {t('users.results.end')}
                </Text>
              )}
            </Group>
          ) : null}
        </Stack>
      </section>
    </Stack>
  )
}