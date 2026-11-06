/**
 * Rewrites react-i18next calls to Paraglide messages, mechanically:
 *
 *   const { t, i18n } = useTranslation(['sheet'])   →  const locale = useLocale()
 *   t('sheet:foo.bar', { name })                    →  m.sheet_foo_bar({ name }, { locale })
 *   t('foo.bar')  (default namespace sheet)         →  m.sheet_foo_bar({}, { locale })
 *   i18n.language / i18n.resolvedLanguage           →  locale
 *   [t] in a hook's dependency list                 →  [locale]
 *
 * A useTranslation() binding is only rewritten when every use of it in its function is one of the above. Anything
 * else (a key that is not a string literal, t passed along as a value, `defaultValue`, other i18n APIs, an existing
 * `locale` or `m` binding) is left untouched and listed, for a hand port.
 *
 * Usage: node scripts/i18n/codemod.ts [--dry] [--deps-only] [files…]   (default: every .ts/.tsx file under src)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { collectEntries } from './convert-i18next.ts'

const webRoot = path.resolve(import.meta.dirname, '../..')
const srcRoot = path.join(webRoot, 'src')

const base = JSON.parse(readFileSync(path.join(srcRoot, 'locales/resources/en.json'), 'utf8'))
const idByKey = new Map(collectEntries(base).map((entry) => [entry.key, entry.id]))

const HOOKS_WITH_DEPS = new Set(['useMemo', 'useCallback', 'useEffect', 'useLayoutEffect', 'useInsertionEffect'])
const UNSUPPORTED_OPTIONS = new Set(['defaultValue', 'ns', 'context', 'returnObjects', 'lng', 'lngs', 'keyPrefix'])

type Edit = { start: number; end: number; text: string }
export type Finding = { file: string; line: number; reason: string }

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'paraglide' || name === 'node_modules' || full === path.join(srcRoot, 'i18n')) return []
    if (statSync(full).isDirectory()) return listFiles(full)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [full] : []
  })
}

function stringValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

function namespacesOf(call: ts.CallExpression): string[] | undefined {
  const arg = call.arguments[0]
  if (!arg) return ['translation']
  const single = stringValue(arg)
  if (single !== undefined) return [single]
  if (ts.isArrayLiteralExpression(arg)) {
    const values = arg.elements.map((element) => stringValue(element))
    if (values.every((value): value is string => value !== undefined)) return values
  }
  return undefined
}

function declaresName(scope: ts.Node, name: string, ignoreImports = false): boolean {
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = true
      return
    }
    if (
      (ts.isFunctionDeclaration(node) || (!ignoreImports && ts.isImportSpecifier(node))) &&
      node.name?.text === name
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

function isHookDepsArray(node: ts.Node): boolean {
  const parent = node.parent
  if (!ts.isArrayLiteralExpression(node) || !parent || !ts.isCallExpression(parent)) return false
  const callee = parent.expression
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
  return HOOKS_WITH_DEPS.has(name) && parent.arguments[1] === node
}

export function transformSource(file: string, source: string): { output: string; findings: Finding[] } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Edit[] = []
  const findings: Finding[] = []
  const rel = path.relative(webRoot, file)
  const report = (node: ts.Node, reason: string) =>
    findings.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, reason })
  let usedMessages = false
  let usedLocaleHook = false
  // An existing `import { m } from '@/paraglide/messages'` is the binding we want
  const fileDeclaresM = declaresName(sf, 'm', true)

  const declarations: ts.VariableDeclaration[] = []
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'useTranslation'
    ) {
      declarations.push(node)
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)

  for (const declaration of declarations) {
    const call = declaration.initializer as ts.CallExpression
    if (!ts.isObjectBindingPattern(declaration.name)) {
      report(declaration, 'useTranslation() result is not destructured')
      continue
    }
    let tName: string | undefined
    let i18nName: string | undefined
    let unknownBinding = false
    for (const element of declaration.name.elements) {
      const prop = (element.propertyName ?? element.name) as ts.Identifier
      const local = ts.isIdentifier(element.name) ? element.name.text : undefined
      if (prop.text === 't' && local) tName = local
      else if (prop.text === 'i18n' && local) i18nName = local
      else unknownBinding = true
    }
    const namespaces = namespacesOf(call)
    let scope: ts.Node = declaration
    while (scope.parent && !ts.isFunctionLike(scope)) scope = scope.parent
    const statement = declaration.parent.parent
    if (unknownBinding || !namespaces) {
      report(declaration, 'unsupported useTranslation() binding or namespaces')
      continue
    }
    if (declaresName(scope, 'locale')) {
      report(declaration, 'scope already declares `locale`')
      continue
    }
    if (fileDeclaresM) {
      report(declaration, 'file already declares `m`')
      continue
    }

    const local: Edit[] = []
    let sink = local
    let blocked = false
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === tName) {
        const key = stringValue(node.arguments[0])
        const options = node.arguments[1]
        if (key === undefined) {
          report(node, 'dynamic key')
          blocked = true
          node.arguments.forEach((arg) => visit(arg))
          return
        } else {
          const fullKey = key.includes(':') ? key : `${namespaces[0]}:${key}`
          const id = idByKey.get(fullKey)
          const unsupported =
            options &&
            ts.isObjectLiteralExpression(options) &&
            options.properties.some((p) => p.name && ts.isIdentifier(p.name) && UNSUPPORTED_OPTIONS.has(p.name.text))
          if (!id) {
            report(node, `unknown key ${fullKey}`)
            blocked = true
            return
          } else if (unsupported || node.arguments.length > 2) {
            report(node, 'unsupported t() options')
            blocked = true
            return
          } else {
            // Rewrite t() calls nested in the inputs first, then splice them into this call's replacement
            const outer = sink
            sink = []
            node.arguments.forEach((arg) => visit(arg))
            const nested = sink
            sink = outer
            let inputs = '{}'
            if (options) {
              const start = options.getStart(sf)
              inputs = applyEdits(
                options.getText(sf),
                nested.map((edit) => ({ ...edit, start: edit.start - start, end: edit.end - start })),
              )
            }
            sink.push({ start: node.getStart(sf), end: node.getEnd(), text: `m.${id}(${inputs}, { locale })` })
            return
          }
        }
      } else if (ts.isIdentifier(node) && node.text === tName && node.parent !== undefined) {
        const parent = node.parent
        if (ts.isBindingElement(parent) && parent.parent === declaration.name) return
        if (isHookDepsArray(parent)) {
          sink.push({ start: node.getStart(sf), end: node.getEnd(), text: 'locale' })
        } else if (!(ts.isPropertyAccessExpression(parent) && parent.name === node)) {
          report(node, '`t` used as a value')
          blocked = true
        }
      } else if (i18nName && ts.isIdentifier(node) && node.text === i18nName) {
        const parent = node.parent
        if (ts.isBindingElement(parent) && parent.parent === declaration.name) return
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
          const grand = parent.parent
          // `i18n.resolvedLanguage ?? i18n.language` as a whole
          if (
            grand &&
            ts.isBinaryExpression(grand) &&
            grand.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
            [grand.left, grand.right].every(
              (side) =>
                ts.isPropertyAccessExpression(side) &&
                ts.isIdentifier(side.expression) &&
                side.expression.text === i18nName &&
                ['language', 'resolvedLanguage'].includes(side.name.text),
            )
          ) {
            if (grand.left === parent) sink.push({ start: grand.getStart(sf), end: grand.getEnd(), text: 'locale' })
            return
          }
          if (['language', 'resolvedLanguage'].includes(parent.name.text)) {
            sink.push({ start: parent.getStart(sf), end: parent.getEnd(), text: 'locale' })
            return
          }
        }
        report(node, `i18n used beyond .language`)
        blocked = true
        return
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(scope, visit)

    if (blocked) continue
    const text = source.slice(statement.getStart(sf), statement.getEnd())
    if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
      report(declaration, 'useTranslation() declared with other variables')
      continue
    }
    edits.push(...local, {
      start: statement.getStart(sf),
      end: statement.getStart(sf) + text.length,
      text: 'const locale = useLocale()',
    })
    usedLocaleHook = true
    if (local.some((edit) => edit.text.startsWith('m.'))) usedMessages = true
  }

  // Hook dependency lists may now name `locale` twice
  let output = applyEdits(source, edits)
  if (!edits.length) return { output: source, findings }
  output = output.replace(/\[([^[\]]*)\]/g, (match, inner: string) => {
    const items = inner.split(',').map((item) => item.trim())
    if (items.filter((item) => item === 'locale').length < 2) return match
    return `[${items.filter((item, index) => item !== 'locale' || items.indexOf('locale') === index).join(', ')}]`
  })

  output = fixImports(output, file, { usedMessages, usedLocaleHook })
  return { output, findings }
}

function applyEdits(source: string, edits: Edit[]): string {
  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  }
  return output
}

function fixImports(source: string, file: string, used: { usedMessages: boolean; usedLocaleHook: boolean }) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Edit[] = []
  const stillUsesHook = /\buseTranslation\(/.test(source)
  const stillUsesTrans = /<Trans\b/.test(source)
  let lastImportEnd = 0
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    lastImportEnd = statement.getEnd()
    if ((statement.moduleSpecifier as ts.StringLiteral).text !== 'react-i18next') continue
    const named = statement.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    const keep = named.elements.filter((element) => {
      const name = element.name.text
      if (name === 'useTranslation') return stillUsesHook
      if (name === 'Trans') return stillUsesTrans
      return true
    })
    if (keep.length === named.elements.length) continue
    const text = keep.length
      ? `import { ${keep.map((element) => element.getText(sf)).join(', ')} } from 'react-i18next'`
      : ''
    let end = statement.getEnd()
    if (!keep.length && source[end] === '\n') end++
    edits.push({ start: statement.getStart(sf), end, text })
  }
  const additions: string[] = []
  if (used.usedLocaleHook && !/import \{[^}]*\buseLocale\b[^}]*\} from '@\/i18n\/LocaleProvider'/.test(source)) {
    additions.push("import { useLocale } from '@/i18n/LocaleProvider'")
  }
  if (used.usedMessages && !/import \{ m \} from '@\/paraglide\/messages'/.test(source)) {
    additions.push("import { m } from '@/paraglide/messages'")
  }
  if (additions.length) edits.push({ start: lastImportEnd, end: lastImportEnd, text: `\n${additions.join('\n')}` })
  return applyEdits(source, edits)
}

/**
 * Adds `locale` to the dependency list of every `use*` hook whose callback reads it: `useCallback(fn, [a])` →
 * `useCallback(fn, [a, locale])`. i18next's `t` followed the current language even from a stale closure; a message
 * call bound to `{ locale }` does not, so a memoized callback must be recreated when the language switches in place.
 */
export function addLocaleDeps(file: string, source: string): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Edit[] = []
  const readsLocale = (fn: ts.Node) => {
    if (declaresName(fn, 'locale', true) && !ts.isArrowFunction(fn)) return false
    let found = false
    const visit = (node: ts.Node) => {
      if (found) return
      if (ts.isIdentifier(node) && node.text === 'locale') {
        const parent = node.parent
        const isPropertyName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node)
        if (!isPropertyName) found = true
        return
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(fn, visit)
    return found
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
      const deps = node.arguments[node.arguments.length - 1]
      const fn = node.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))
      if (/^use[A-Z]/.test(name) && fn && deps && deps !== fn && ts.isArrayLiteralExpression(deps)) {
        const params = (fn as ts.ArrowFunction).parameters
        const shadowed = params.some((param) => declaresName(param, 'locale'))
        const listed = deps.elements.some((element) => ts.isIdentifier(element) && element.text === 'locale')
        if (!shadowed && !listed && readsLocale(fn)) {
          const end = deps.getEnd() - 1
          const text = deps.elements.length ? (deps.elements.hasTrailingComma ? ' locale' : ', locale') : 'locale'
          edits.push({ start: end, end, text })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return applyEdits(source, edits)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  // Only the dependency-list pass, for files already ported by hand
  const depsOnly = args.includes('--deps-only')
  const targets = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(arg))
  const files = targets.length ? targets : listFiles(srcRoot)
  const findings: Finding[] = []
  let changed = 0
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const result = depsOnly ? { output: source, findings: [] } : transformSource(file, source)
    result.output = addLocaleDeps(file, result.output)
    findings.push(...result.findings)
    if (result.output !== source) {
      changed++
      if (!dry) writeFileSync(file, result.output)
    }
  }
  for (const finding of findings) console.log(`${finding.file}:${finding.line}  ${finding.reason}`)
  console.log(`\n${changed} files ${dry ? 'would change' : 'changed'}, ${findings.length} sites left for hand ports`)
}