import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'
import plugin from '../index.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const dropsRejection = { message: /^`void` drops a promise rejection/ }

tester.run('no-void', plugin.rules['no-void'], {
  valid: ['refetch().catch(reportRejection)', 'await refetch()', '<Button onClick={asyncHandler(() => refetch())} />'],
  invalid: [
    { code: 'void refetch()', errors: [dropsRejection] },
    { code: '<Button onClick={() => void refetch()} />', errors: [dropsRejection] },
  ],
})