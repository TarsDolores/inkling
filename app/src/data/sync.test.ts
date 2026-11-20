import { describe, expect, it } from 'vitest'
import { normalizeBackupInfo, normalizeNote, normalizeSnapshot } from './sync'

describe('normalizeNote', () => {
  it('fills missing fields so one hand-edited file cannot break the whole page', () => {
    const note = normalizeNote({ id: 'broken-note', content: '正文', createdAt: 100, updatedAt: 200 })
    expect(note).not.toBeNull()
    expect(note?.title).toBe('')
    expect(note?.tags).toEqual([])
    expect(note?.topicId).toBe('fleeting')
    expect(note?.wordCount).toBe(2)
    expect(note?.activeDates).toEqual([])
  })

  it('rejects unsafe ids and filters malformed activity dates', () => {
    expect(normalizeNote({ id: 'bad id', content: '正文' })).toBeNull()
    const note = normalizeNote({ id: 'safe-note', content: '正文', activeDates: ['2026-10-22', 'yesterday', 7] })
    expect(note?.activeDates).toEqual(['2026-10-22'])
  })
})

describe('normalizeSnapshot', () => {
  it('keeps usable entries and replaces invalid settings with safe defaults', () => {
    const snapshot = normalizeSnapshot({
      notes: [{ id: 'note-1', content: '文字' }, { id: 'not a note' }],
      topics: [{ id: 'topic-1', name: ' ' }],
      settings: { theme: 'neon', fontSize: 99, interfaceFontSize: 1, lineHeight: 99, motion: 'wild' }
    })
    expect(snapshot.notes).toHaveLength(1)
    expect(snapshot.topics[0].name).toBe('未命名主题')
    expect(snapshot.settings.theme).toBe('system')
    expect(snapshot.settings.fontSize).toBe(32)
    expect(snapshot.settings.interfaceFontSize).toBe(10)
    expect(snapshot.settings.lineHeight).toBe(2.8)
    expect(snapshot.settings.motion).toBe('full')
  })
})

describe('normalizeBackupInfo', () => {
  it('only accepts safe backup file names', () => {
    expect(normalizeBackupInfo({ name: '../../settings.json', size: 1 })).toBeNull()
    expect(normalizeBackupInfo({ name: 'suiji-backup-daily-2026-10-22-PC.json', size: 2048, modifiedAt: 10, reason: 'daily' })?.size).toBe(2048)
  })
})
