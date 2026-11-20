import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const projectRoot = resolve(import.meta.dirname, '..')
const svgPath = join(projectRoot, 'public', 'icon.svg')
const outputPath = join(projectRoot, 'launcher', 'suiji.ico')
const previewPath = join(projectRoot, 'launcher', 'suiji.png')
const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const executablePath = browserPaths.find(existsSync)
if (!executablePath) throw new Error('没有找到 Chrome 或 Edge，无法导出 Windows 图标。')

await mkdir(dirname(outputPath), { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath })
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = []
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(svgPath).href)
    const png = await page.screenshot({ omitBackground: true })
    images.push({ size, png })
    await page.close()
  }
} finally {
  await browser.close()
}

const headerSize = 6 + images.length * 16
let offset = headerSize
const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
images.forEach(({ size, png }, index) => {
  const position = 6 + index * 16
  header.writeUInt8(size === 256 ? 0 : size, position)
  header.writeUInt8(size === 256 ? 0 : size, position + 1)
  header.writeUInt8(0, position + 2)
  header.writeUInt8(0, position + 3)
  header.writeUInt16LE(1, position + 4)
  header.writeUInt16LE(32, position + 6)
  header.writeUInt32LE(png.length, position + 8)
  header.writeUInt32LE(offset, position + 12)
  offset += png.length
})
await writeFile(outputPath, Buffer.concat([header, ...images.map(({ png }) => png)]))
await writeFile(previewPath, images.at(-1).png)
console.log(`Windows icon written: ${outputPath}`)
