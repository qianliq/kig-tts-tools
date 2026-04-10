import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const publicWavsDir = path.resolve(__dirname, '../public/wavs')
const outputFile = path.resolve(publicWavsDir, 'wav-list.json')

async function main() {
  const entries = await readdir(publicWavsDir, { withFileTypes: true })
  const wavFiles = entries
    .filter((entry) => entry.isFile() && /\.wav$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      url: `/wavs/${entry.name}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  await writeFile(outputFile, JSON.stringify(wavFiles, null, 2), 'utf8')
  console.log(`[OK] Generated wav list: ${wavFiles.length} item(s)`)
}

main().catch((error) => {
  console.error('[ERROR] Failed to generate wav list')
  console.error(error)
  process.exit(1)
})
