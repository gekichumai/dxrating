import { Stack } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { OperationalRefresh } from '../components/operational-refresh'
import { PlaceholderPage } from '../components/placeholder-page'
import { useAdminData } from '../data/admin-data-context'
import { adminBootstrapQueryOptions } from '../data/query-options'

export const DashboardRoute = () => {
  const data = useAdminData()
  const bootstrap = useQuery(adminBootstrapQueryOptions(data))

  return (
    <Stack gap="lg" mt="md">
      <OperationalRefresh
        dataUpdatedAt={bootstrap.dataUpdatedAt}
        isFetching={bootstrap.isFetching}
        onRefresh={bootstrap.refetch}
      />
      {bootstrap.error ? (
        <AdminErrorNotice
          error={bootstrap.error}
          onRefresh={() => void bootstrap.refetch()}
          onRetry={() => void bootstrap.refetch()}
        />
      ) : null}
      <PlaceholderPage destinationId="dashboard" />
    </Stack>
  )
}