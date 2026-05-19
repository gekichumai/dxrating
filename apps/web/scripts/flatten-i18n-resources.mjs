import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const resourcesDir = path.resolve(scriptDir, '../src/locales/resources')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function flattenObject(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const flatKey = prefix ? `${prefix}.${key}` : key

    if (isPlainObject(child)) {
      flattenObject(child, flatKey, result)
      continue
    }

    if (Object.hasOwn(result, flatKey)) {
      throw new Error(`Duplicate i18n key after flattening: ${flatKey}`)
    }

    result[flatKey] = child
  }

  return result
}

function flattenNamespaces(resource) {
  const flattened = {}

  for (const [namespace, entries] of Object.entries(resource)) {
    flattened[namespace] = isPlainObject(entries) ? flattenObject(entries) : entries
  }

  return flattened
}

const files = (await readdir(resourcesDir)).filter((file) => file.endsWith('.json')).sort()

for (const file of files) {
  const filePath = path.join(resourcesDir, file)
  const resource = JSON.parse(await readFile(filePath, 'utf8'))
  const flattened = flattenNamespaces(resource)

  await writeFile(filePath, JSON.stringify(flattened, null, 2))
  console.log(`Flattened ${path.relative(process.cwd(), filePath)}`)
}