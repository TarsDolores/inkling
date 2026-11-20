import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, Note, SpaceId, Topic } from '../types'
import { DEFAULT_AI_PERSONA } from '../lib/aiPersona'

interface SettingRecord { key: 'app'; value: AppSettings }

class QuietDatabase extends Dexie {
  notes!: EntityTable<Note, 'id'>
  topics!: EntityTable<Topic, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>

  constructor() {
    super('quiet-note-db')
    this.version(1).stores({
      notes: 'id, updatedAt, createdAt, topicId, pinned, deletedAt',
      topics: 'id, createdAt',
      settings: 'key'
    })
  }
}

export const db = new QuietDatabase()

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 18,
  interfaceFontSize: 13,
  lineHeight: 1.9,
  motion: 'full',
  typewriterMode: false,
  fontDisplay: '',
  fontUi: '',
  fontMono: '',
  fontWriting: '',
  aiPersona: DEFAULT_AI_PERSONA,
  aiDefaultRange: '30d',
  aiDefaultMode: 'excerpt',
  echoSize: 'standard',
  showEchoKeywords: true,
  showHeatmap: true,
  spaces: [
    { id: 'life', name: '生活' },
    { id: 'research', name: '科研' }
  ]
}

export const DEFAULT_TOPICS_BY_SPACE: Partial<Record<SpaceId, Topic[]>> = {
  life: [
    { id: 'fleeting', name: '闪念', color: '#708b82', builtIn: true, createdAt: 1, updatedAt: 1 },
    { id: 'essay', name: '随笔', color: '#9a846c', builtIn: true, createdAt: 2, updatedAt: 2 },
    { id: 'diary', name: '日记', color: '#8a7f91', builtIn: true, createdAt: 3, updatedAt: 3 }
  ],
  research: [
    { id: 'research', name: '研究', color: '#718397', builtIn: true, createdAt: 1, updatedAt: 1 }
  ],
  inbox: [
    { id: 'inbox', name: '默认', color: '#8d766d', builtIn: true, createdAt: 1, updatedAt: 1 }
  ]
}

export const DEFAULT_TOPICS: Topic[] = Object.values(DEFAULT_TOPICS_BY_SPACE).flat().filter((topic): topic is Topic => Boolean(topic))

export async function initializeDatabase(space: SpaceId) {
  const topicCount = await db.topics.count()
  if (!topicCount) {
    // 已知空间用各自的默认主题；用户新建的空间只给一个「默认」，避免把别的空间主题带进来
    const defaults = DEFAULT_TOPICS_BY_SPACE[space] ?? [{ id: 'inbox', name: '默认', color: '#8d766d', builtIn: true, createdAt: 1, updatedAt: 1 }]
    await db.topics.bulkPut(defaults)
  }
  if (!(await db.settings.get('app'))) await db.settings.put({ key: 'app', value: DEFAULT_SETTINGS })
}

const DRAFT_KEY = 'quiet-note-pending-draft'

export function storeEmergencyDraft(note: Note) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(note))
}

export function clearEmergencyDraft(id: string, updatedAt: number) {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try {
    const draft = JSON.parse(raw) as Note
    if (draft.id === id && draft.updatedAt <= updatedAt) localStorage.removeItem(DRAFT_KEY)
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}

export async function recoverEmergencyDraft() {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try {
    const draft = JSON.parse(raw) as Note
    const saved = await db.notes.get(draft.id)
    if (!saved || draft.updatedAt > saved.updatedAt) await db.notes.put(draft)
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}
