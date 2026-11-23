const MOCKERS = new Set(['mock', 'doMock'])
const OWN_MODULE = /^(\.{1,2}\/|@\/|@gekichumai\/)/

const noOwnModuleMock = {
  meta: {
    type: 'problem',
    docs: { description: 'A test may fake an external boundary, never a module of this repo.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee?.type !== 'MemberExpression' ||
          callee.object?.type !== 'Identifier' ||
          callee.object.name !== 'vi' ||
          !MOCKERS.has(callee.property?.name)
        ) {
          return
        }
        const argument = node.arguments[0]
        const source = argument?.type === 'ImportExpression' ? argument.source : argument
        if (source?.type !== 'Literal' || typeof source.value !== 'string' || !OWN_MODULE.test(source.value)) return
        context.report({
          node: argument,
          message: `vi.${callee.property.name}('${source.value}') replaces our own module, so the test pins how the code is built, not what it does. Run the real module (a real router, providers and child components on the web; setupTestServer and Postgres on the backend) and fake only an external boundary: the network, a third-party SDK or a browser API.`,
        })
      },
    }
  },
}

export default { meta: { name: 'test-boundaries' }, rules: { 'no-own-module-mock': noOwnModuleMock } }