import { describe, expect, it } from 'vitest'
import { parseBackup } from './export'
import type { BackupData } from '../types'
import { DEFAULT_AI_PERSONA } from './aiPersona'

const backup: BackupData = {
  version: 1,
  exportedAt: 1,
  notes: [{ id: 'n1', title: '', content: '文字', topicId: 'fleeting', tags: [], createdAt: 1, updatedAt: 1, accumulatedWritingSeconds: 0, wordCount: 2, pinned: false }],
  topics: [{ id: 'fleeting', name: '闪念', color: '#708b82', builtIn: true, createdAt: 1 }],
  settings: { theme: 'system', fontSize: 18, interfaceFontSize: 13, lineHeight: 1.9, motion: 'full', typewriterMode: false, fontDisplay: '', fontUi: '', fontMono: '', fontWriting: '', aiEnabled: true, aiPersona: DEFAULT_AI_PERSONA, aiDefaultRange: '30d', aiDefaultMode: 'excerpt', echoSize: 'standard', showEchoKeywords: true, showHeatmap: true, spaces: [{ id: 'life', name: '生活' }, { id: 'research', name: '科研' }] }
}

describe('parseBackup', () => {
  it('accepts a complete backup', () => expect(parseBackup(JSON.stringify(backup))).toEqual(backup))
  it('rejects malformed notes before any database write', () => {
    const malformed = { ...backup, notes: [{ id: 'broken' }] }
    expect(() => parseBackup(JSON.stringify(malformed))).toThrow('无效')
  })
  it('migrates backups created before interface font sizing existed', () => {
    const legacy = { ...backup, settings: { theme: 'system', fontSize: 18, lineHeight: 1.9, motion: 'full', typewriterMode: false } }
    expect(parseBackup(JSON.stringify(legacy)).settings.interfaceFontSize).toBe(13)
  })
})
