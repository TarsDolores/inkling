import { download } from './export'
import { localDateKey, type WritingStats } from './stats'

const WIDTH = 540
const HEIGHT = 960
const SCALE = 2

function writingDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60)
  if (totalMinutes === 0) return seconds > 0 ? '不足 1 分钟' : '0 分钟'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return [hours ? `${hours.toLocaleString('zh-CN')} 小时` : '', minutes || !hours ? `${minutes} 分钟` : ''].filter(Boolean).join(' ')
}

export async function createStatsShareImage(stats: WritingStats, now = new Date()): Promise<Blob> {
  const style = getComputedStyle(document.querySelector('.home-page') ?? document.documentElement)
  const color = (name: string) => style.getPropertyValue(name).trim()
  const palette = {
    background: color('--bg'),
    surface: color('--home-surface') || color('--surface-strong'),
    ink: color('--ink'),
    muted: color('--muted'),
    line: color('--line'),
    accent: color('--accent')
  }
  const family = color('--font-ui') || 'system-ui, sans-serif'
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = HEIGHT * SCALE
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('无法创建分享图画布')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const font = (size: number, weight = 400) => { ctx.font = `${weight} ${size}px ${family}` }
  const text = (value: string, x: number, y: number, size: number, fill = palette.ink, weight = 400, align: CanvasTextAlign = 'left') => {
    font(size, weight)
    ctx.fillStyle = fill
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(value, x, y)
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const panel = (x: number, y: number, width: number, height: number, radius = 18) => {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
    ctx.fillStyle = palette.surface
    ctx.fill()
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const metric = (value: number, unit: string, x: number, y: number, width: number, preferredSize = 28, unitSize = 14) => {
    const label = value.toLocaleString('zh-CN')
    font(unitSize)
    const available = width - ctx.measureText(unit).width - 9
    font(preferredSize, 500)
    const size = Math.min(preferredSize, preferredSize * available / Math.max(1, ctx.measureText(label).width))
    text(label, x, y, size, palette.ink, 500)
    const valueWidth = ctx.measureText(label).width
    text(unit, x + valueWidth + 9, y, unitSize, palette.muted)
  }

  panel(32, 28, 32, 32, 9)
  text('随', 48, 50, 17, palette.ink, 500, 'center')
  text('随记', 76, 51, 19, palette.ink, 600)
  text(new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(now), 508, 49, 14, palette.muted, 400, 'right')
  text('写作回顾', 32, 120, 32, palette.ink, 600)
  text('每一份积累，都来自你的文字', 32, 153, 16, palette.muted)

  panel(32, 188, 476, 224)
  text('累计字数', 56, 226, 16, palette.muted)
  metric(stats.totalWords, '字', 56, 307, 428, 78, 20)
  line(56, 338, 484, 338)
  text('累计专注', 56, 382, 16, palette.muted)
  const duration = writingDuration(stats.totalWritingSeconds)
  font(23, 500)
  const timeSize = Math.min(23, 23 * 300 / Math.max(1, ctx.measureText(duration).width))
  text(duration, 484, 382, timeSize, palette.ink, 500, 'right')

  panel(32, 430, 476, 252)
  line(270, 430, 270, 682)
  line(32, 514, 508, 514)
  line(32, 598, 508, 598)
  const metrics = [
    { label: '当前连续记录', value: stats.currentDailyStreak, unit: '天' },
    { label: '最长连续天数', value: stats.longestDailyStreak, unit: '天' },
    { label: '最长连续周数', value: stats.longestWeeklyStreak, unit: '周' },
    { label: '今年写作天数', value: stats.activeDaysThisYear, unit: '天' },
    { label: '今年写下文章', value: stats.notesThisYear, unit: '篇' },
    { label: '今日记录文章', value: stats.todayNotes, unit: '篇' }
  ]
  metrics.forEach((item, index) => {
    const x = 56 + (index % 2) * 238
    const y = 430 + Math.floor(index / 2) * 84
    text(item.label, x, y + 28, 15, palette.muted)
    metric(item.value, item.unit, x, y + 66, 190)
  })

  panel(32, 700, 476, 176)
  text('近 12 个月的写作足迹', 56, 734, 16, palette.ink, 500)
  text('活跃天数', 484, 734, 13, palette.muted, 400, 'right')
  const maxMonth = Math.max(1, ...stats.monthActivity.map(month => month.count))
  const step = 428 / 12
  stats.monthActivity.forEach((month, index) => {
    const x = 56 + index * step + step / 2
    const height = Math.max(3, month.count / maxMonth * 72)
    ctx.beginPath()
    ctx.roundRect(x - 6, 832 - height, 12, height, Math.min(4, height / 2))
    ctx.fillStyle = palette.accent
    ctx.globalAlpha = index >= 9 ? .9 : .5
    ctx.fill()
    ctx.globalAlpha = 1
    text(month.label.replace('月', ''), x, 857, 13, palette.muted, 400, 'center')
  })

  line(32, 902, 508, 902)
  text('写下当下，留给以后。', 32, 931, 14, palette.muted)
  text('随记 · 写作回顾', 508, 931, 13, palette.muted, 400, 'right')

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('分享图生成失败')), 'image/png')
  })
}

export async function exportStatsShareImage(stats: WritingStats, now = new Date()) {
  const image = await createStatsShareImage(stats, now)
  download(image, 'image/png', `随记-写作回顾-${localDateKey(now)}.png`)
}
