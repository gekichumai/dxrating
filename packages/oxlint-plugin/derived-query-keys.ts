/**
 * A TanStack Query key is derived from the request it caches, never written by hand. A hand-written key leaves out an
 * input the response depends on (the account, the catalog, a count), and the stale response stays.
 */
import type { RuleTester } from 'oxlint/plugins-dev'

type Rule = Parameters<RuleTester['run']>[1]
type Visitor = ReturnType<Extract<Rule, { create: unknown }>['create']>
type PropertyNode = Parameters<NonNullable<Visitor['Property']>>[0]
type CallNode = Parameters<NonNullable<Visitor['CallExpression']>>[0]
type AnyNode = { type: string; name?: unknown; value?: unknown; expression?: AnyNode }

const message =
  'Hand-written query key. Use orpc.<route>.queryOptions({ input }), or requestQuery(name, request, load) from @/lib/query: the key is derived from the request.'

const KEYED_METHODS = new Set(['setQueryData', 'getQueryData', 'getQueryState', 'fetchQuery', 'prefetchQuery'])

const propertyName = (node: AnyNode) =>
  node.type === 'Identifier' ? node.name : node.type === 'Literal' ? node.value : null

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion'])
const isArrayLiteral = (node: AnyNode | null | undefined): boolean =>
  node != null && (node.type === 'ArrayExpression' || (TYPE_WRAPPERS.has(node.type) && isArrayLiteral(node.expression)))

export const derivedQueryKeys: Rule = {
  meta: { type: 'problem', docs: { description: 'Query keys come from the request, not array literals' }, schema: [] },
  create(context) {
    return {
      Property(node: PropertyNode) {
        if (
          !node.computed &&
          propertyName(node.key as AnyNode) === 'queryKey' &&
          isArrayLiteral(node.value as AnyNode)
        ) {
          context.report({ node: node.value, message })
        }
      },
      CallExpression(node: CallNode) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          KEYED_METHODS.has(propertyName(callee.property as AnyNode) as string) &&
          isArrayLiteral(node.arguments[0] as AnyNode | undefined)
        ) {
          context.report({ node: node.arguments[0], message })
        }
      },
    }
  },
}