import fs from 'node:fs/promises'
import childProcess from 'node:child_process'
import path from 'node:path'

// Get assets directory from command line arguments
const args = process.argv.slice(2)
const assetsDir = args[0] || 'public'

const WHITELIST_GLOB = [
  'images/version-logo/*.jpg',
  'images/version-logo/*.webp',
  'images/background/*.jpg',
  'images/background/*.webp',
  'favicon/*.jpg'
]

export interface Asset {
  width: number
  height: number
  path: string
}


async function main() {
  console.log(`🔍 Searching for assets in: ${assetsDir}`)

  const files = new Set<string>()
  for (const glob of WHITELIST_GLOB) {
    try {
      const p = path.join(assetsDir, glob)
      const pathIterator = fs.glob(p)
      for await (const filePath of pathIterator) {
        files.add(filePath)
      }
    } catch (error) {
      console.warn(`⚠️  No files found matching pattern: ${glob}`)
    }
  }

  if (files.size === 0) {
    console.log('⚠️  No files found to process. Creating empty assets.json...')

    await fs.writeFile(
      path.join(process.cwd(), './src/utils/assetpack.json'), 
      JSON.stringify({}, null, 2)
    )
    console.log('✅ Created empty assets.json')
    return
  }

  const assetsData: Record<string, Asset> = {}

  for (const file of files) {
    const r = await new Promise<string>((resolve, reject) => {
      return childProcess.exec(`/usr/bin/env exiftool -j '${file}'`, {
        cwd: process.cwd(),
      }, (error, stdout, stderr) => {
        if (error) {
          return reject(error)
        }

        resolve(stdout)
      })
    })
    
    const [exif] = JSON.parse(r) as Array<{
      ImageWidth: number
      ImageHeight: number
      FileSize: string
    }>

    const stats = await fs.stat(file)
    const name = path.basename(file, path.extname(file))

    // Convert absolute path to relative public URL path
    const relativePath = path.relative(assetsDir, file)
    const publicPath = `/${relativePath.replace(/\\/g, '/')}`

    // Use the path as the key
    assetsData[publicPath] = {
      width: exif.ImageWidth,
      height: exif.ImageHeight,
      path: publicPath,
    }
  }

  // Write the JSON file to the public directory so it can be fetched by the browser
  await fs.writeFile(
    path.join(process.cwd(), './src/utils/assetpack.json'), 
    JSON.stringify(assetsData, null, 2)
  )
  
  console.log(`✅ Generated assets.json with ${Object.keys(assetsData).length} assets`)
  
  // Log processed files for verification
  for (const [path, asset] of Object.entries(assetsData)) {
    console.log(`   ${asset.path} (${asset.width}×${asset.height}) → ${path}`)
  }
}

main().catch(console.error)