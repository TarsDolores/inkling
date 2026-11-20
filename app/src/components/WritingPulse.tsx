import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { localDateKey } from '../lib/stats'

const dayFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })
const numberFormatter = new Intl.NumberFormat('zh-CN')

function atNoon(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function startOfWeek(date: Date) {
  const result = atNoon(date)
  const day = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - day)
  return result
}

export function WritingPulse() {
  const notes = useAppStore((state) => state.notes)

  const pulse = useMemo(() => {
    const end = atNoon()
    const start = addDays(end, -29)
    const gridStart = startOfWeek(start)
    const activity = new Map<string, { chars: number; notes: Set<string> }>()

    for (const note of notes) {
      if (note.deletedAt) continue
      const dates = note.activeDates?.length
        ? [...new Set(note.activeDates)]
        : [...new Set([localDateKey(new Date(note.createdAt)), localDateKey(new Date(note.updatedAt))])]
      if (!dates.length) continue
      const share = Math.max(0, note.wordCount) / dates.length
      for (const date of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
        const entry = activity.get(date) ?? { chars: 0, notes: new Set<string>() }
        entry.chars += share
        entry.notes.add(note.id)
        activity.set(date, entry)
      }
    }

    const cells = Array.from({ length: 35 }, (_, index) => {
      const date = addDays(gridStart, index)
      const key = localDateKey(date)
      const entry = activity.get(key)
      return {
        key,
        date,
        inRange: date >= start && date <= end,
        chars: entry ? Math.round(entry.chars) : 0,
        notes: entry ? entry.notes.size : 0
      }
    })
    const visible = cells.filter((cell) => cell.inRange)
    const max = Math.max(1, ...visible.map((cell) => cell.chars))
    return {
      cells: visible.map((cell) => ({
        ...cell,
        level: cell.chars <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((cell.chars / max) * 4)))
      })),
      activeDays: visible.filter((cell) => cell.chars > 0).length,
      chars: visible.reduce((sum, cell) => sum + cell.chars, 0)
    }
  }, [notes])

  return (
    <div className="month-strip" aria-label="最近 30 天写作活跃度">
      <span className="month-strip-label">最近 30 天</span>
      <div className="month-strip-grid" role="img" aria-label={`最近 30 天有 ${pulse.activeDays} 天留下文字，约 ${numberFormatter.format(pulse.chars)} 字`}>
        {pulse.cells.map((cell) => (
          <span
            key={cell.key}
            className={`month-cell level-${cell.level}`}
            title={`${dayFormatter.format(cell.date)} · 约 ${numberFormatter.format(cell.chars)} 字 · ${cell.notes} 篇`}
            aria-label={`${dayFormatter.format(cell.date)}，约 ${numberFormatter.format(cell.chars)} 字`}
          />
        ))}
      </div>
      <span className="month-strip-meta">{pulse.activeDays} 天 · {numberFormatter.format(pulse.chars)} 字</span>
    </div>
  )
}
