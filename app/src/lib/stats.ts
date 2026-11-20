import type { Note } from '../types'

export interface WritingStats {
  currentDailyStreak: number
  longestDailyStreak: number
  currentWeeklyStreak: number
  longestWeeklyStreak: number
  activeDaysThisYear: number
  notesThisYear: number
  totalWords: number
  totalWritingSeconds: number
  todayNotes: number
  monthActivity: { label: string; count: number }[]
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function dayBefore(date: Date) {
  const result = new Date(date)
  result.setDate(result.getDate() - 1)
  return result
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  return result
}

function longestConsecutive(keys: string[], unit: 'day' | 'week') {
  if (!keys.length) return 0
  const sorted = [...new Set(keys)].sort()
  let longest = 1
  let current = 1
  const expectedDays = unit === 'day' ? 1 : 7
  for (let index = 1; index < sorted.length; index++) {
    const diff = Math.round((dateFromKey(sorted[index]).getTime() - dateFromKey(sorted[index - 1]).getTime()) / 86_400_000)
    current = diff === expectedDays ? current + 1 : 1
    longest = Math.max(longest, current)
  }
  return longest
}

export function calculateWritingStats(notes: Note[], now = new Date()): WritingStats {
  const activeNotes = notes.filter((note) => !note.deletedAt)
  const activeDates = new Set<string>()

  for (const note of activeNotes) {
    if (note.activeDates?.length) note.activeDates.forEach((date) => activeDates.add(date))
    else if (note.title.trim() || note.content.trim()) {
      activeDates.add(localDateKey(new Date(note.createdAt)))
      activeDates.add(localDateKey(new Date(note.updatedAt)))
    }
  }

  let currentDailyStreak = 0
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  while (activeDates.has(localDateKey(cursor))) {
    currentDailyStreak++
    cursor = dayBefore(cursor)
  }

  const weeklyKeys = new Set([...activeDates].map((date) => localDateKey(startOfWeek(dateFromKey(date)))))
  let currentWeeklyStreak = 0
  let weekCursor = startOfWeek(now)
  while (weeklyKeys.has(localDateKey(weekCursor))) {
    currentWeeklyStreak++
    weekCursor.setDate(weekCursor.getDate() - 7)
  }

  const year = now.getFullYear()
  const monthActivity = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(year, now.getMonth() - 11 + offset, 1)
    const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { label: `${date.getMonth() + 1}月`, count: [...activeDates].filter((key) => key.startsWith(prefix)).length }
  })

  const today = localDateKey(now)
  return {
    currentDailyStreak,
    longestDailyStreak: longestConsecutive([...activeDates], 'day'),
    currentWeeklyStreak,
    longestWeeklyStreak: longestConsecutive([...weeklyKeys], 'week'),
    activeDaysThisYear: [...activeDates].filter((date) => date.startsWith(`${year}-`)).length,
    notesThisYear: activeNotes.filter((note) => new Date(note.createdAt).getFullYear() === year).length,
    totalWords: activeNotes.reduce((sum, note) => sum + note.wordCount, 0),
    totalWritingSeconds: activeNotes.reduce((sum, note) => sum + note.accumulatedWritingSeconds, 0),
    todayNotes: activeNotes.filter((note) => localDateKey(new Date(note.updatedAt)) === today && (note.title.trim() || note.content.trim())).length,
    monthActivity
  }
}
