const noVoid = {
  meta: { type: 'problem' },
  create(context) {
    return {
      UnaryExpression(node) {
        if (node.operator !== 'void') return
        context.report({
          node,
          message:
            '`void` drops a promise rejection, which reaches Sentry as unhandled, so ignore the "add void operator" hint from no-floating-promises. Await the promise, or end it with a .catch: in apps/web, `.catch(reportRejection)`, or wrap an async event handler in `asyncHandler` (both from @/lib/rejections).',
        })
      },
    }
  },
}

export default { meta: { name: 'dxrating' }, rules: { 'no-void': noVoid } }