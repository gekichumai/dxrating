import { Badge, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import { useAdminTranslation } from '../i18n'
import { getAdminDestinationById, type AdminDestinationId } from '../navigation'
import classes from './placeholder-page.module.css'

export const PlaceholderPage = ({ destinationId }: { destinationId: AdminDestinationId }) => {
  const { t } = useAdminTranslation()
  const destination = getAdminDestinationById(destinationId)
  const Icon = destination.icon

  return (
    <Paper className={classes.surface} p={{ base: 'lg', sm: 'xl' }} radius="lg">
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <ThemeIcon radius="lg" size={48} variant="light">
          <Icon aria-hidden="true" size={25} stroke={1.7} />
        </ThemeIcon>
        <Stack className={classes.content} gap="sm">
          <Badge leftSection={<IconCircleCheck aria-hidden="true" size={13} />} variant="light">
            {t('page.placeholder.badge')}
          </Badge>
          <Text c="dimmed" maw={720} size="md">
            {t(destination.descriptionKey)}
          </Text>
          <Text fw={600} size="sm">
            {t('page.placeholder.next')}
          </Text>
        </Stack>
      </Group>
    </Paper>
  )
}