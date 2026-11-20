import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { calculateWritingStats } from './stats'

const note = (changes: Partial<Note>): Note => ({
  id: crypto.randomUUID(), title: '', content: '文字', topicId: 'fleeting', tags: [],
  createdAt: new Date(2026, 8, 24).getTime(), updatedAt: new Date(2026, 8, 26).getTime(),
  accumulatedWritingSeconds: 180, wordCount: 20, pinned: false, ...changes
})

describe('calculateWritingStats', () => {
  it('calculates daily and weekly streaks from real activity dates', () => {
    const stats = calculateWritingStats([
      note({ activeDates: ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'] }),
      note({ activeDates: ['2026-09-14'], wordCount: 30 })
    ], new Date(2026, 8, 26, 12))
    expect(stats.currentDailyStreak).toBe(5)
    expect(stats.longestDailyStreak).toBe(5)
    expect(stats.currentWeeklyStreak).toBe(2)
    expect(stats.totalWords).toBe(50)
  })

  it('falls back to created and updated dates for older notes', () => {
    const stats = calculateWritingStats([note({ activeDates: undefined })], new Date(2026, 8, 26, 12))
    expect(stats.activeDaysThisYear).toBe(2)
    expect(stats.notesThisYear).toBe(1)
  })

  it('ignores notes in the trash', () => {
    const stats = calculateWritingStats([note({ deletedAt: Date.now(), activeDates: ['2026-09-26'] })], new Date(2026, 8, 26, 12))
    expect(stats.totalWords).toBe(0)
    expect(stats.activeDaysThisYear).toBe(0)
  })
})
