import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative } from 'node:path'

interface Manifest {
  name: string
  dir: string
  declared: Set<string>
}

interface Node {
  type: string
  [key: string]: unknown
}

interface Context {
  filename: string
  cwd: string
  report(descriptor: { node: Node; message: string }): void
}

const builtins = new Set(builtinModules)
const manifests = new Map<string, Manifest>()

function manifestFor(fileDir: string): Manifest | undefined {
  for (let dir = fileDir; ; dir = dirname(dir)) {
    const cached = manifests.get(dir)
    if (cached) return cached
    const path = join(dir, 'package.json')
    if (existsSync(path)) {
      const json = JSON.parse(readFileSync(path, 'utf8'))
      const manifest = {
        name: json.name,
        dir,
        declared: new Set(
          ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((field) =>
            Object.keys(json[field] ?? {}),
          ),
        ),
      }
      manifests.set(dir, manifest)
      return manifest
    }
    if (dirname(dir) === dir) return undefined
  }
}

function packageName(specifier: string): string | undefined {
  if (/^[.#~/]/.test(specifier) || specifier.includes(':')) return undefined
  const [first, second] = specifier.split('/')
  if (!first.startsWith('@')) return builtins.has(first) ? undefined : first
  return first.length > 1 && second ? `${first}/${second}` : undefined
}

const typesPackage = (name: string) => `@types/${name.replace(/^@/, '').replace('/', '__')}`

const declaredDependency = {
  meta: {
    type: 'problem',
    docs: { description: 'Every bare import names a package the importing workspace declares in its package.json.' },
    schema: [],
  },
  create(context: Context) {
    const manifest = manifestFor(dirname(context.filename))
    if (!manifest) return {}
    const declarationFile = /\.d\.[cm]?ts$/.test(context.filename)

    const check = (source: unknown, node: Node, typeOnly: boolean) => {
      if (typeof source !== 'string') return
      const name = packageName(source)
      if (!name || name === manifest.name || manifest.declared.has(name)) return
      if ((typeOnly || declarationFile) && manifest.declared.has(typesPackage(name))) return
      context.report({
        node,
        message: `Add ${name} to ${relative(context.cwd, join(manifest.dir, 'package.json'))} (dependencies, or devDependencies for build and test code). Undeclared, it resolves only through hoisting, which a clean or frozen install can break.`,
      })
    }

    const sourceValue = (node: Node) => (node.source as Node | null | undefined)?.value
    return {
      ImportDeclaration: (node: Node) => check(sourceValue(node), node, node.importKind === 'type'),
      ExportNamedDeclaration: (node: Node) => check(sourceValue(node), node, node.exportKind === 'type'),
      ExportAllDeclaration: (node: Node) => check(sourceValue(node), node, node.exportKind === 'type'),
      ImportExpression: (node: Node) => check(sourceValue(node), node, false),
      TSImportType: (node: Node) => check(sourceValue(node), node, true),
      TSExternalModuleReference: (node: Node) => check((node.expression as Node).value, node, false),
      CallExpression: (node: Node) => {
        const callee = node.callee as Node
        const [argument] = node.arguments as Node[]
        if (callee.type === 'Identifier' && callee.name === 'require' && argument?.type === 'Literal') {
          check(argument.value, node, false)
        }
      },
    }
  },
}

export default {
  meta: { name: 'workspace' },
  rules: { 'declared-dependency': declaredDependency },
}