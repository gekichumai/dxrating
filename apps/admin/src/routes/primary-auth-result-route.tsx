import { AdminPrimaryAuthResult } from '../auth/admin-primary-auth-result'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAdminTranslation } from '../i18n'

export const PrimaryAuthResultRoute = () => {
  const { t } = useAdminTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <AdminPrimaryAuthResult
      labels={{
        checkingDescription: t('primaryAuthResult.checking.description'),
        checkingTitle: t('primaryAuthResult.checking.title'),
        continue: t('primaryAuthResult.continue'),
        failureDescription: t('primaryAuthResult.failure.description'),
        failureTitle: t('primaryAuthResult.failure.title'),
        retry: t('primaryAuthResult.retry'),
        successDescription: t('primaryAuthResult.success.description'),
        successTitle: t('primaryAuthResult.success.title'),
      }}
      onContinue={() => void navigate({ replace: true, to: '/' })}
      search={location.searchStr}
    />
  )
}