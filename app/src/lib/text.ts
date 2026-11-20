import type { Note } from '../types'

export function countWords(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0
  const latinAndNumbers = text
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
    .match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return cjk + latinAndNumbers
}

export function displayTitle(note: Pick<Note, 'title' | 'content'>): string {
  const explicit = note.title.trim()
  if (explicit) return explicit.length > 42 ? `${explicit.slice(0, 41)}…` : explicit
  const firstLine = note.content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ''
  if (/^(?:```|~~~)/.test(firstLine)) return '代码片段'
  const title = firstLine.replace(/^#{1,6}\s*/, '')
  if (!title) return '无题'
  return title.length > 42 ? `${title.slice(0, 41)}…` : title
}

export function excerpt(content: string, length = 120): string {
  return content.replace(/^#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim().slice(0, length)
}

export function noteExcerpt(note: Pick<Note, 'title' | 'content'>, length = 120): string {
  if (note.title.trim()) return excerpt(note.content, length)
  const lines = note.content.split(/\r?\n/)
  const firstContentLine = lines.findIndex((line) => line.trim())
  if (firstContentLine >= 0) lines.splice(firstContentLine, 1)
  return excerpt(lines.join('\n'), length)
}

const LETTER_INDENT = '　　'
const markdownBlockStart = /^(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|\|| {4}|\t)/

export function formatLetterContent(content: string): string {
  let titleSeen = false
  let inCodeFence = false

  return content.split('\n').map((line) => {
    const trimmed = line.trimStart()
    const isFence = /^(?:```|~~~)/.test(trimmed)

    if (inCodeFence) {
      if (isFence) inCodeFence = false
      return line
    }
    if (isFence) {
      inCodeFence = true
      return line
    }
    if (!titleSeen) {
      if (!line.trim()) return line
      titleSeen = true
      return line.replace(/^　+/, '')
    }
    if (!line.trim()) return line
    if (markdownBlockStart.test(line)) return line
    if (line.startsWith(LETTER_INDENT)) return line
    if (line.startsWith('　')) return `　${line}`
    return `${LETTER_INDENT}${line}`
  }).join('\n')
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  if (diff < 60_000) return '刚刚'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}分钟前`
  const date = new Date(timestamp)
  const current = new Date(now)
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1)
  if (date >= yesterday && date < new Date(current.getFullYear(), current.getMonth(), current.getDate())) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  if (date.getFullYear() === current.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatFullTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return '<1 分钟'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

export function safeFileName(name: string): string {
  return (name || '无题').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80)
}
