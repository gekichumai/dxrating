/**
 * An oxlint JS plugin: a TanStack Query key is derived from the request it caches, never written by hand. A hand-written
 * key leaves out an input the response depends on (the account, the catalog, a count), and the stale response stays.
 */
const message =
  'Hand-written query key. Use orpc.<route>.queryOptions({ input }), or requestQuery(name, request, load) from @/lib/query: the key is derived from the request.'

const KEYED_METHODS = new Set(['setQueryData', 'getQueryData', 'getQueryState', 'fetchQuery', 'prefetchQuery'])

const propertyName = (node) => (node.type === 'Identifier' ? node.name : node.type === 'Literal' ? node.value : null)

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion'])
const isArrayLiteral = (node) =>
  node != null && (node.type === 'ArrayExpression' || (TYPE_WRAPPERS.has(node.type) && isArrayLiteral(node.expression)))

export default {
  meta: { name: 'dxrating' },
  rules: {
    'derived-query-keys': {
      meta: { type: 'problem', docs: { description: 'Query keys come from the request, not array literals' } },
      create(context) {
        return {
          Property(node) {
            if (!node.computed && propertyName(node.key) === 'queryKey' && isArrayLiteral(node.value)) {
              context.report({ node: node.value, message })
            }
          },
          CallExpression(node) {
            const callee = node.callee
            if (
              callee.type === 'MemberExpression' &&
              !callee.computed &&
              KEYED_METHODS.has(propertyName(callee.property)) &&
              isArrayLiteral(node.arguments[0])
            ) {
              context.report({ node: node.arguments[0], message })
            }
          },
        }
      },
    },
  },
}