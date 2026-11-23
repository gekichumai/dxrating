const MOCKERS = new Set(['mock', 'doMock'])
const VITEST = new Set(['vi', 'vitest'])
const OWN_MODULE = /^(\.{1,2}\/|\/|@\/|@gekichumai\/)/

const staticString = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return undefined
}

const mockerName = (callee) => {
  if (callee?.type !== 'MemberExpression' || callee.object?.type !== 'Identifier' || !VITEST.has(callee.object.name)) {
    return undefined
  }
  const name = callee.computed ? staticString(callee.property) : callee.property?.name
  return MOCKERS.has(name) ? `${callee.object.name}.${name}` : undefined
}

const noOwnModuleMock = {
  meta: {
    type: 'problem',
    docs: { description: 'A test may fake an external boundary, never a module of this repo.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const mocker = mockerName(node.callee)
        if (!mocker) return
        const argument = node.arguments[0]
        const specifier = staticString(argument?.type === 'ImportExpression' ? argument.source : argument)
        if (specifier === undefined || !OWN_MODULE.test(specifier)) return
        context.report({
          node: argument,
          message: `${mocker}('${specifier}') replaces our own module, so the test pins how the code is built, not what it does. Run the real module (a real router, providers and child components on the web; setupTestServer and Postgres on the backend) and fake only an external boundary: the network, a third-party SDK or a browser API.`,
        })
      },
    }
  },
}

export default { meta: { name: 'test-boundaries' }, rules: { 'no-own-module-mock': noOwnModuleMock } }