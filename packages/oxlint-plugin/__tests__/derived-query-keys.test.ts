import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'
import plugin from '../index.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const handWritten = { message: /^Hand-written query key\./ }

tester.run('derived-query-keys', plugin.rules['derived-query-keys'], {
  valid: [
    'useQuery(orpc.tags.list.queryOptions({ input: {} }))',
    'useQuery({ queryKey: keyFor(request), queryFn })',
    'queryClient.setQueryData(orpc.tags.list.queryKey({ input: {} }), data)',
    'const options = { [queryKey]: ["computed"] }',
  ],
  invalid: [
    { code: 'useQuery({ queryKey: ["comments", sheetId], queryFn })', errors: [handWritten] },
    { code: 'useQuery({ queryKey: ["comments"] as const, queryFn })', errors: [handWritten] },
    { code: 'queryClient.setQueryData(["aliases"], data)', errors: [handWritten] },
    { code: 'queryClient.prefetchQuery(["aliases"] satisfies unknown[])', errors: [handWritten] },
  ],
})