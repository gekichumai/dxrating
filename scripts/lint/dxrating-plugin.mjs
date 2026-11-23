const noVoid = {
  meta: { type: 'problem' },
  create(context) {
    return {
      UnaryExpression(node) {
        if (node.operator !== 'void') return
        context.report({
          node,
          message:
            '`void` drops a promise rejection, which reaches Sentry as unhandled. Await it, or end it with .catch(...) that handles the rejection.',
        })
      },
    }
  },
}

export default { meta: { name: 'dxrating' }, rules: { 'no-void': noVoid } }