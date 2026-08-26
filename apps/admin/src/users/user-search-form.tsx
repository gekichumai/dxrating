import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconEraser, IconSearch } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAdminTranslation } from '../i18n'
import {
  hasUserListFilters,
  parseUserListFilterDraft,
  userListFilterDraftFromSearch,
  type UserListFilterDraft,
  type UserListFilterField,
  type UserListFilters,
  type UserListSearch,
} from './user-route-search'

export type UserSearchFormProps = {
  readonly disabled?: boolean
  readonly search: UserListSearch
  readonly onClear: () => void
  readonly onSubmit: (filters: UserListFilters) => void
}

const replaceDraftField = <TField extends UserListFilterField>(
  draft: UserListFilterDraft,
  field: TField,
  value: UserListFilterDraft[TField],
): UserListFilterDraft => ({ ...draft, [field]: value })

export const UserSearchForm = ({ disabled = false, search, onClear, onSubmit }: UserSearchFormProps) => {
  const { t } = useAdminTranslation()
  const [draft, setDraft] = useState(() => userListFilterDraftFromSearch(search))
  const [errors, setErrors] = useState<Partial<Record<UserListFilterField, 'invalid'>>>({})

  useEffect(() => {
    setDraft(userListFilterDraftFromSearch(search))
    setErrors({})
  }, [search.activeBan, search.displayName, search.effectiveRole, search.email, search.userId])

  const update = <TField extends UserListFilterField>(field: TField, value: UserListFilterDraft[TField]) => {
    setDraft((current) => replaceDraftField(current, field, value))
    setErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parseUserListFilterDraft(draft)
    if (!parsed.success) {
      setErrors(parsed.errors)
      return
    }
    setDraft(userListFilterDraftFromSearch(parsed.value))
    setErrors({})
    onSubmit(parsed.value)
  }

  const clear = () => {
    setDraft(userListFilterDraftFromSearch({}))
    setErrors({})
    onClear()
  }

  const draftHasValues = Object.values(draft).some((value) => value.length > 0)

  return (
    <Paper component="section" p="lg" radius="lg" shadow="xs" withBorder>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2} size="h3">
            {t('users.search.title')}
          </Title>
          <Text c="dimmed" size="sm">
            {t('users.search.description')}
          </Text>
        </Stack>

        <form aria-label={t('users.search.formLabel')} noValidate onSubmit={submit}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="sm">
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={errors.userId ? t('users.search.validation.userId') : undefined}
                label={t('users.search.userId')}
                onChange={(event) => update('userId', event.currentTarget.value)}
                placeholder={t('users.search.userIdPlaceholder')}
                spellCheck={false}
                value={draft.userId}
              />
              <TextInput
                autoComplete="off"
                disabled={disabled}
                error={errors.displayName ? t('users.search.validation.displayName') : undefined}
                label={t('users.search.displayName')}
                onChange={(event) => update('displayName', event.currentTarget.value)}
                placeholder={t('users.search.displayNamePlaceholder')}
                value={draft.displayName}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={errors.email ? t('users.search.validation.email') : undefined}
                label={t('users.search.email')}
                onChange={(event) => update('email', event.currentTarget.value)}
                placeholder={t('users.search.emailPlaceholder')}
                spellCheck={false}
                type="email"
                value={draft.email}
              />
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: t('users.search.anyRole') },
                  { value: 'user', label: t('users.role.user') },
                  { value: 'admin', label: t('users.role.admin') },
                  { value: 'super_admin', label: t('users.role.superAdmin') },
                ]}
                disabled={disabled}
                error={errors.effectiveRole ? t('users.search.validation.role') : undefined}
                label={t('users.search.effectiveRole')}
                onChange={(value) => update('effectiveRole', (value ?? '') as UserListFilterDraft['effectiveRole'])}
                value={draft.effectiveRole}
              />
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: t('users.search.anyBanStatus') },
                  { value: 'false', label: t('users.search.notBanned') },
                  { value: 'true', label: t('users.search.currentlyBanned') },
                ]}
                disabled={disabled}
                error={errors.activeBan ? t('users.search.validation.banStatus') : undefined}
                label={t('users.search.banStatus')}
                onChange={(value) => update('activeBan', (value ?? '') as UserListFilterDraft['activeBan'])}
                value={draft.activeBan}
              />
            </SimpleGrid>

            <Group gap="sm" justify="flex-end" wrap="wrap">
              <Button
                disabled={disabled || (!draftHasValues && !hasUserListFilters(search) && !search.cursor)}
                leftSection={<IconEraser aria-hidden="true" size={17} />}
                onClick={clear}
                type="button"
                variant="default"
              >
                {t('users.search.clear')}
              </Button>
              <Button disabled={disabled} leftSection={<IconSearch aria-hidden="true" size={17} />} type="submit">
                {t('users.search.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}