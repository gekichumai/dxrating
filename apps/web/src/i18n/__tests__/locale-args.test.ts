import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * A Paraglide message called without `{ locale }` reads the isolate-wide client locale. That is right in browser-only
 * code (effects, which never run during SSR, and the modules below), and wrong during a server render: a Worker
 * isolate serves requests in different locales at once. So every other call must pass the locale from useLocale().
 */
const BROWSER_ONLY_MODULES = ['src/components/rating/io/import/importFromNETRecords.tsx']
const EFFECT_HOOKS = new Set([
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useEffectOnce',
  'useMountEffect',
  'useUpdateEffect',
])

const webRoot = path.resolve(__dirname, '../../..')
const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'paraglide' || name === '__tests__' || /\.test\.tsx?$/.test(name)) return []
    if (statSync(full).isDirectory()) return listFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })

const hookName = (call: ts.CallExpression) => {
  const callee = call.expression
  return ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
}

function insideEffect(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    const parent: ts.Node | undefined = current.parent
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      parent &&
      ts.isCallExpression(parent) &&
      parent.arguments[0] === current &&
      EFFECT_HOOKS.has(hookName(parent))
    ) {
      return true
    }
  }
  return false
}

describe('Paraglide message calls', () => {
  it('pass { locale } outside effects and browser-only modules', () => {
    const offenders: string[] = []
    for (const file of listFiles(path.join(webRoot, 'src'))) {
      const rel = path.relative(webRoot, file)
      if (BROWSER_ONLY_MODULES.includes(rel)) continue
      const source = readFileSync(file, 'utf8')
      if (!source.includes('@/paraglide/messages')) continue
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'm' &&
          node.arguments.length < 2 &&
          !insideEffect(node)
        ) {
          offenders.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    expect(offenders).toEqual([])
  })
})