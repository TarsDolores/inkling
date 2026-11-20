import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const baseURL = process.env.SUIJI_BASE_URL ?? 'http://127.0.0.1:4173'
const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const executablePath = browserPaths.find(existsSync)
if (!executablePath) throw new Error('没有找到可用于回归测试的 Chrome 或 Edge。')
const browser = await chromium.launch({ headless: true, executablePath })
await mkdir('screenshots', { recursive: true })

const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light', locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => errors.push(`page: ${error.message}`))

const assert = (condition, message) => { if (!condition) throw new Error(message) }

await page.goto(baseURL, { waitUntil: 'networkidle' })
const localChineseFont = await page.evaluate(async () => {
  await document.fonts.load('16px "LXGW WenKai Local"', '中文写作')
  return document.fonts.check('16px "LXGW WenKai Local"', '中文写作')
})
assert(localChineseFont, '本地中文字体没有成功加载')
await page.getByRole('button', { name: '写第一篇' }).click()
await page.getByLabel('文章正文').fill('雨夜里的微小坐标\n\n雨落在窗台上，像一串没有寄出的标点。\n\n今晚重新整理了关于「慢思考」的笔记。The quiet mind notices more：先观察，再判断。\n\n明天想继续追问：当信息变得更快，我们如何保留自己的节奏？')
const letterContent = await page.getByLabel('文章正文').inputValue()
assert(letterContent.startsWith('雨夜里的微小坐标\n\n　　雨落'), '标题不应缩进，正文自然段应缩进两个汉字')
assert(letterContent.includes('\n\n　　今晚重新整理'), '每个正文自然段都应自动缩进')
await page.waitForTimeout(900)
assert(await page.getByText('已保存', { exact: true }).isVisible(), '自动保存状态没有变为已保存')

await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /打开文章：雨夜里的微小坐标/ }).click()
assert((await page.getByLabel('文章正文').inputValue()).includes('保留自己的节奏'), '刷新后最后一段文字未恢复')
await page.waitForTimeout(900)
await page.screenshot({ path: 'screenshots/desktop-editor.png', fullPage: true })

await page.getByRole('button', { name: '更多操作' }).click()
for (const format of ['MD', 'TXT', 'HTML']) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: format, exact: true }).click()
  const download = await downloadPromise
  assert(download.suggestedFilename().toLowerCase().endsWith(`.${format.toLowerCase()}`), `${format} 导出文件名不正确`)
}
await page.getByRole('button', { name: /研究/ }).click()
await page.waitForTimeout(750)
await page.getByRole('button', { name: '返回首页' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '新建文章' }).click()
await page.getByLabel('文章正文').fill('清晨六点，城市还没有完全醒来。\n给今天留一句简单的话：少一点着急，多一点准确。')
await page.waitForTimeout(800)
await page.getByRole('button', { name: '更多操作' }).click()
await page.getByRole('button', { name: '固定文章' }).click()
await page.getByRole('button', { name: '返回首页' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'screenshots/desktop-home.png', fullPage: true })

await page.locator('.sidebar nav').getByRole('button', { name: /研究/ }).click()
const topicDialog = page.getByRole('dialog', { name: '研究主题文章' })
await topicDialog.waitFor({ state: 'visible' })
assert(await topicDialog.getByRole('button', { name: /雨夜里的微小坐标/ }).isVisible(), '主题文章面板没有显示该主题的文章')
await page.waitForTimeout(700)
await page.screenshot({ path: 'screenshots/desktop-topic-panel.png', fullPage: true })
await topicDialog.getByRole('button', { name: /雨夜里的微小坐标/ }).click()
await page.getByLabel('文章正文').waitFor({ state: 'visible' })
await page.getByRole('button', { name: '返回首页' }).click()

await page.keyboard.press('Control+K')
await page.getByRole('textbox', { name: '搜索' }).fill('慢思考')
assert(await page.getByRole('dialog', { name: '搜索文章' }).getByRole('button', { name: /雨夜里的微小坐标/ }).isVisible(), '全文搜索未命中文章')
await page.keyboard.press('Escape')

await page.getByRole('button', { name: '删除文章：雨夜里的微小坐标' }).click()
await page.getByRole('button', { name: '撤销' }).click()
await page.waitForTimeout(300)
assert(await page.getByRole('button', { name: /打开文章：雨夜里的微小坐标/ }).isVisible(), '删除撤销后文章未恢复')

await page.getByRole('button', { name: /打开文章：雨夜里的微小坐标/ }).click()
await page.getByRole('button', { name: '返回首页' }).click()
await page.locator('.header-actions').getByRole('button', { name: '设置' }).click()
await page.getByRole('button', { name: '深色' }).click()
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
assert(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), '深色模式未生效')
await page.getByRole('button', { name: '浅色' }).click()

const originalInterfaceSize = await page.locator('.settings-header h1').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
await page.getByRole('slider', { name: /界面字号/ }).fill('17')
await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-13').trim() === '17px')
const enlargedInterfaceSize = await page.locator('.settings-header h1').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
assert(enlargedInterfaceSize > originalInterfaceSize, '界面字号调节没有生效')

await page.getByLabel('新主题颜色').fill('#6f898b')
await page.getByPlaceholder('输入新主题名称').fill('长期项目')
await page.getByRole('button', { name: '创建', exact: true }).click()
await page.waitForFunction(() => [...document.querySelectorAll('input[aria-label="主题名称"]')].some((element) => element.value === '长期项目'))
assert(await page.locator('input[aria-label="主题名称"]').evaluateAll((elements) => elements.some((element) => element.value === '长期项目')), '自定义主题没有成功创建')

const backupDownloadPromise = page.waitForEvent('download')
await page.getByRole('button', { name: /导出完整备份/ }).click()
const backupDownload = await backupDownloadPromise
assert(backupDownload.suggestedFilename().endsWith('.json'), '全部数据导出不是 JSON')
const backupStream = await backupDownload.createReadStream()
const backupChunks = []
for await (const chunk of backupStream) backupChunks.push(chunk)
const backupBuffer = Buffer.concat(backupChunks)
await page.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backupBuffer })
await page.getByText(/已安全合并 2 篇文章/).waitFor()
await page.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"notes":[{"id":"broken"}]}') })
await page.getByText(/导入失败/).waitFor()

await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '新建文章' }).waitFor({ state: 'visible' })
await page.getByRole('button', { name: /打开文章：雨夜里的微小坐标/ }).click()
const offlineContent = await page.getByLabel('文章正文').inputValue()
await page.getByLabel('文章正文').fill(`${offlineContent}\n\n离线时补记的一句话。`)
await page.waitForTimeout(800)
assert((await page.getByLabel('文章正文').inputValue()).includes('离线时补记'), '无互联网依赖的本地服务无法编辑已有文章')

assert(errors.length === 0, `浏览器控制台错误：\n${errors.join('\n')}`)
console.log(JSON.stringify({
  persistence: 'passed',
  autosave: 'passed',
  search: 'passed',
  deleteAndRestore: 'passed',
  exportsAndImportValidation: 'passed',
  themes: 'passed',
  localServiceReload: 'passed',
  localChineseFont: 'passed',
  interfaceFontSizing: 'passed',
  customTopics: 'passed',
  topicPanel: 'passed',
  letterEditor: 'passed',
  consoleErrors: errors.length,
  screenshots: ['screenshots/desktop-home.png', 'screenshots/desktop-editor.png', 'screenshots/desktop-topic-panel.png']
}, null, 2))

await browser.close()
