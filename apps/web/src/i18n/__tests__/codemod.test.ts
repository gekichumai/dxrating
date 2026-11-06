import { describe, expect, it } from 'vitest'
import { addLocaleDeps, transformSource } from '../../../scripts/i18n/codemod.ts'

const port = (source: string) => {
  const transformed = transformSource('/virtual/Component.tsx', source)
  const deps = addLocaleDeps('/virtual/Component.tsx', transformed.output)
  return { output: deps.output, findings: [...transformed.findings, ...deps.findings] }
}

describe('i18next → Paraglide codemod', () => {
  it('passes the locale to messages rendered by a component', () => {
    const { output } = port(`import { useTranslation } from 'react-i18next'
export const Title = () => {
  const { t } = useTranslation(['sheet'])
  return <h1>{t('details.title')}</h1>
}
`)
    expect(output).toContain('const locale = useLocale()')
    expect(output).toContain('m.sheet_details_title({}, { locale })')
    expect(output).not.toContain('useTranslation')
  })

  it('recreates memoized callbacks when the locale changes', () => {
    const { output } = port(`import { useTranslation } from 'react-i18next'
export const Add = () => {
  const { t } = useTranslation(['auth'])
  const [state, add] = useAsyncFn(async () => {
    toast.success(t('user-profile.passkeys.added'))
  }, [queryClient])
  return <button onClick={add}>{t('user-profile.passkeys.add')}</button>
}
`)
    expect(output).toContain('m.auth_userProfile_passkeys_added({}, { locale })')
    expect(output).toContain('}, [queryClient, locale])')
  })

  it('leaves effect dependencies alone, so a language switch never re-triggers an effect', () => {
    const { output, findings } = port(`import { useTranslation } from 'react-i18next'
export const AutoImport = () => {
  const { t } = useTranslation()
  useEffect(() => {
    toast(t('rating-calculator:io.import.net-records.cached.title'))
  }, [catalog])
  return null
}
`)
    // Effects never run during SSR: the message resolves the client locale when it fires, as i18next's t did
    expect(output).toContain('toast(m.ratingCalculator_io_import_netRecords_cached_title({}))')
    expect(output).toContain('}, [catalog])')
    expect(output).toContain('  useLocale()\n')
    expect(findings).toEqual([])
  })

  it('reports an effect that reads the locale instead of adding a dependency', () => {
    const { output, findings } = addLocaleDeps(
      '/virtual/Component.tsx',
      `export const Effect = () => {
  const locale = useLocale()
  useEffect(() => {
    document.title = m.root_notFound_title({}, { locale })
  }, [catalog])
  return null
}
`,
    )
    expect(output).toContain('}, [catalog])')
    expect(findings).toHaveLength(1)
  })
})