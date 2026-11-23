import type { RuleTester } from 'oxlint/plugins-dev'

type Rule = Parameters<RuleTester['run']>[1]
type Visitor = ReturnType<Extract<Rule, { create: unknown }>['create']>
type FunctionNode =
  | Parameters<NonNullable<Visitor['FunctionDeclaration']>>[0]
  | Parameters<NonNullable<Visitor['ArrowFunctionExpression']>>[0]

const isHookName = (name: string) => /^use[A-Z0-9]/.test(name)
const isComponentName = (name: string) => /^[A-Z]/.test(name)

const functionName = (node: FunctionNode) => {
  if (node.id) return node.id.name
  const { parent } = node
  return parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : ''
}

const noNestedComponent: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A component defined inside a hook or a component is a new type on every render, so React remounts it.',
    },
    schema: [],
  },
  create(context) {
    const stack: { node: FunctionNode; name: string }[] = []
    const reported = new Set<FunctionNode>()
    const enter = (node: FunctionNode) => {
      stack.push({ node, name: functionName(node) })
    }
    const exit = () => {
      stack.pop()
    }
    const onJsx = () => {
      const outer = stack.findIndex(({ name }) => isHookName(name) || isComponentName(name))
      if (outer === -1) return
      for (const { node, name } of stack.slice(outer + 1)) {
        if (!isComponentName(name) || reported.has(node)) continue
        reported.add(node)
        const host = stack[outer].name
        context.report({
          node,
          message: `${name} is a component defined inside ${host}, so every render of ${host} makes a new component type and React remounts ${name}, losing its state. Define ${name} at module scope; pass state through props or a store.`,
        })
      }
    }
    return {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
      JSXElement: onJsx,
      JSXFragment: onJsx,
    }
  },
}

export default {
  meta: { name: 'dxrating' },
  rules: { 'no-nested-component': noNestedComponent },
}