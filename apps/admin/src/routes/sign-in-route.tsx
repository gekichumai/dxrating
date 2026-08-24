import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import type { FormEvent } from 'react'
import { useAdminTranslation } from '../i18n'
import classes from './sign-in-route.module.css'

export const SignInRoute = () => {
  const { t } = useAdminTranslation()
  const preventSubmit = (event: FormEvent<HTMLFormElement>) => event.preventDefault()

  return (
    <Center component="main" className={classes.page}>
      <Paper className={classes.card} p="xl" radius="lg">
        <Stack gap="lg">
          <Stack gap={6}>
            <Text c="indigo" fw={750} size="sm">
              {t('app.name')}
            </Text>
            <Title id="sign-in-title" order={1}>
              {t('signIn.title')}
            </Title>
            <Text c="dimmed">{t('signIn.description')}</Text>
          </Stack>
          <Alert icon={<IconInfoCircle aria-hidden="true" size={18} />} variant="light">
            {t('shell.sessionPending')}
          </Alert>
          <form aria-labelledby="sign-in-title" onSubmit={preventSubmit}>
            <fieldset className={classes.fieldset} disabled>
              <Stack gap="md">
                <TextInput
                  autoComplete="email"
                  label={t('signIn.email')}
                  placeholder={t('signIn.emailPlaceholder')}
                  type="email"
                />
                <PasswordInput autoComplete="current-password" label={t('signIn.password')} />
                <Button fullWidth type="submit">
                  {t('signIn.submit')}
                </Button>
              </Stack>
            </fieldset>
          </form>
        </Stack>
      </Paper>
    </Center>
  )
}