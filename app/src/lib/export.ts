import type { BackupData, Note, Topic } from '../types'
import { DEFAULT_SETTINGS } from '../data/db'
import { displayTitle, safeFileName } from './text'

export function download(content: BlobPart, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!)
}

export function exportNote(note: Note, format: 'md' | 'txt' | 'html') {
  const title = displayTitle(note)
  const tags = note.tags.length ? `\n\n标签：${note.tags.join('、')}` : ''
  if (format === 'html') {
    const body = escapeHtml(note.content).replace(/\n/g, '<br>')
    download(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{max-width:720px;margin:64px auto;padding:24px;font:17px/1.9 ui-monospace,monospace;color:#252825}</style><h1>${escapeHtml(title)}</h1><p>${body}</p></html>`, 'text/html;charset=utf-8', `${safeFileName(title)}.html`)
    return
  }
  const text = format === 'md' ? `# ${title}\n\n${note.content}${tags ? `\n\n${tags}` : ''}` : `${title}\n\n${note.content}${tags}`
  download(text, 'text/plain;charset=utf-8', `${safeFileName(title)}.${format}`)
}

export function exportBackup(data: BackupData) {
  download(JSON.stringify(data, null, 2), 'application/json;charset=utf-8', `随记备份-${new Date().toISOString().slice(0, 10)}.json`)
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export function parseBackup(raw: string): BackupData {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error('备份文件不是有效对象')
  const backup = data as Partial<BackupData>
  if (backup.version !== 1 && backup.version !== 2) throw new Error('备份版本或结构不受支持')
  const validNote = (note: Note) => note && typeof note === 'object' &&
    typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string' &&
    typeof note.topicId === 'string' && isStringArray(note.tags) && isNumber(note.createdAt) &&
    isNumber(note.updatedAt) && isNumber(note.accumulatedWritingSeconds) && isNumber(note.wordCount) &&
    typeof note.pinned === 'boolean' && (note.activeDates === undefined || isStringArray(note.activeDates))
  const validTopic = (topic: Topic) => topic && typeof topic === 'object' &&
    typeof topic.id === 'string' && typeof topic.name === 'string' && typeof topic.color === 'string' &&
    typeof topic.builtIn === 'boolean' && isNumber(topic.createdAt)

  let validNotes = true
  let validTopics = true
  if (backup.version === 1) {
    if (!Array.isArray(backup.notes) || !Array.isArray(backup.topics)) throw new Error('备份版本或结构不受支持')
    validNotes = backup.notes.every(validNote)
    validTopics = backup.topics.every(validTopic)
  } else {
    if (!backup.spaces || typeof backup.spaces !== 'object') throw new Error('备份版本或结构不受支持')
    for (const space of ['life', 'research'] as const) {
      const part = backup.spaces[space]
      if (!part) continue
      validNotes = validNotes && Array.isArray(part.notes) && part.notes.every(validNote)
      validTopics = validTopics && Array.isArray(part.topics) && part.topics.every(validTopic)
    }
  }

  const settings = { ...DEFAULT_SETTINGS, ...(backup.settings as Partial<BackupData['settings']>) }
  const validSettings = ['light', 'dark', 'system'].includes(settings.theme) &&
    isNumber(settings.fontSize) && settings.fontSize >= 12 && settings.fontSize <= 32 &&
    isNumber(settings.interfaceFontSize) && settings.interfaceFontSize >= 10 && settings.interfaceFontSize <= 20 &&
    isNumber(settings.lineHeight) && settings.lineHeight >= 1.2 && settings.lineHeight <= 2.8 &&
    ['full', 'reduced', 'off'].includes(settings.motion) && typeof settings.typewriterMode === 'boolean'
  if (!validNotes || !validTopics || !validSettings) throw new Error('备份中包含无效的文章、主题或设置')
  return { ...(backup as BackupData), settings }
}
