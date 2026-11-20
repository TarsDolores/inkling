import { create } from 'zustand'
import { db, clearEmergencyDraft, DEFAULT_SETTINGS, DEFAULT_TOPICS_BY_SPACE, initializeDatabase, recoverEmergencyDraft } from '../data/db'
import {
  createBackup,
  ensureDailyBackup,
  getLastMutationAt,
  getSyncRevision,
  getSyncSnapshot,
  mergeLocalSnapshot,
  permanentlyDeleteSyncNote,
  permanentlyDeleteSyncTopic,
  restoreBackup as restoreSyncBackup,
  saveSyncNote,
  saveSyncSettings,
  saveSyncTopic,
  type SyncSnapshot
} from '../data/sync'
import type { AppSettings, BackupData, Note, SpaceConfig, SpaceId, Topic } from '../types'
import { countWords } from '../lib/text'

type View = 'home' | 'editor' | 'settings'

interface AppState {
  ready: boolean
  error: string | null
  space: SpaceId
  switching: boolean
  notes: Note[]
  topics: Topic[]
  settings: AppSettings
  view: View
  activeNoteId: string | null
  topicFilter: string
  searchOpen: boolean
  trashOpen: boolean
  toast: string | null
  initialize: () => Promise<void>
  switchSpace: (space: SpaceId) => Promise<void>
  refreshFromDisk: (force?: boolean) => Promise<void>
  createNote: () => Promise<Note | null>
  discardNote: (id: string) => Promise<void>
  openNote: (id: string) => void
  goHome: () => void
  saveNote: (note: Note) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  moveToTrash: (id: string) => Promise<boolean>
  restoreNote: (id: string) => Promise<void>
  deleteForever: (id: string) => Promise<void>
  restoreFromBackup: (name: string) => Promise<boolean>
  setFilter: (id: string) => void
  setSearchOpen: (open: boolean) => void
  setTrashOpen: (open: boolean) => void
  setView: (view: View) => void
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
  addTopic: (name: string, color: string) => Promise<void>
  updateTopic: (id: string, changes: Partial<Pick<Topic, 'name' | 'color'>>) => Promise<void>
  deleteTopic: (id: string) => Promise<void>
  importBackup: (data: BackupData) => Promise<void>
  showToast: (text: string | null) => void
}

const sortNotes = (notes: Note[]) => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
const REFRESH_QUIET_MS = 6_000
const BACKUP_CHECK_INTERVAL = 6 * 60 * 60 * 1000
const SPACE_KEY = 'suiji-active-space'
const CACHE_SPACE_KEY = 'suiji-cache-space'

let lastRevision: string | null = null
let lastRevisionSpace: SpaceId | null = null
let lastBackupCheck = 0
/** 新建但还没有写进任何内容的文章：只存在本机内存，写出第一个字才真正落盘。 */
const pendingNoteIds = new Set<string>()

function readActiveSpace(): SpaceId {
  try { return localStorage.getItem(SPACE_KEY) || 'life' } catch { return 'life' }
}

/** 当前空间列表里是否包含该空间；不包含则回退到第一个。 */
function pickValidSpace(space: SpaceId, spaces: SpaceConfig[]): SpaceId {
  return spaces.some((item) => item.id === space) ? space : spaces[0]?.id ?? 'life'
}

function defaultTopicId(space: SpaceId, topics: Topic[]) {
  const spaceDefault = DEFAULT_TOPICS_BY_SPACE[space]
  if (spaceDefault?.length && topics.some((topic) => topic.id === spaceDefault[0].id)) return spaceDefault[0].id
  return topics[0]?.id ?? spaceDefault?.[0]?.id ?? 'fleeting'
}

async function readRevision(space: SpaceId) {
  try { return await getSyncRevision(space) } catch { return null }
}

function scheduleBackupCheck() {
  if (Date.now() - lastBackupCheck < BACKUP_CHECK_INTERVAL) return
  lastBackupCheck = Date.now()
  void ensureDailyBackup().catch(() => { /* A backup can wait for the next check. */ })
}

/**
 * Cache only what actually changed. A full clear + rewrite every four seconds
 * used to make disk polling expensive and interrupted unrelated writes.
 */
async function cacheSnapshot(snapshot: SyncSnapshot) {
  await db.transaction('rw', db.notes, db.topics, db.settings, async () => {
    const [existingNotes, existingTopics, currentSettings] = await Promise.all([
      db.notes.toArray(),
      db.topics.toArray(),
      db.settings.get('app')
    ])

    const existingNotesById = new Map(existingNotes.map((note) => [note.id, note]))
    const snapshotNoteIds = new Set(snapshot.notes.map((note) => note.id))
    const changedNotes = snapshot.notes.filter((note) => {
      const current = existingNotesById.get(note.id)
      return !current
        || current.createdAt !== note.createdAt
        || current.updatedAt !== note.updatedAt
        || current.deletedAt !== note.deletedAt
        || current.title !== note.title
        || current.content !== note.content
        || current.topicId !== note.topicId
        || current.pinned !== note.pinned
        || current.wordCount !== note.wordCount
        || current.accumulatedWritingSeconds !== note.accumulatedWritingSeconds
        || (current.tags ?? []).join('\u0000') !== note.tags.join('\u0000')
        || (current.activeDates ?? []).join('\u0000') !== (note.activeDates ?? []).join('\u0000')
    })
    const removedNoteIds = existingNotes.filter((note) => !snapshotNoteIds.has(note.id)).map((note) => note.id)
    if (changedNotes.length) await db.notes.bulkPut(changedNotes)
    if (removedNoteIds.length) await db.notes.bulkDelete(removedNoteIds)

    const existingTopicsById = new Map(existingTopics.map((topic) => [topic.id, topic]))
    const snapshotTopicIds = new Set(snapshot.topics.map((topic) => topic.id))
    const changedTopics = snapshot.topics.filter((topic) => {
      const current = existingTopicsById.get(topic.id)
      return !current
        || (current.updatedAt ?? current.createdAt) !== (topic.updatedAt ?? topic.createdAt)
        || current.name !== topic.name
        || current.color !== topic.color
        || current.builtIn !== topic.builtIn
    })
    const removedTopicIds = existingTopics.filter((topic) => !snapshotTopicIds.has(topic.id)).map((topic) => topic.id)
    if (changedTopics.length) await db.topics.bulkPut(changedTopics)
    if (removedTopicIds.length) await db.topics.bulkDelete(removedTopicIds)

    const nextSettings = { ...DEFAULT_SETTINGS, ...snapshot.settings }
    if (!currentSettings || JSON.stringify(currentSettings.value) !== JSON.stringify(nextSettings)) {
      await db.settings.put({ key: 'app', value: nextSettings })
    }
  })
}

export const useAppStore = create<AppState>((set, get) => {
  const notifyError = (error: unknown, fallback: string) => {
    const detail = error instanceof Error && error.message ? error.message : '未知错误'
    set({ toast: `${fallback}：${detail}` })
  }

  const applySnapshot = async (snapshot: SyncSnapshot) => {
    await cacheSnapshot(snapshot)
    // 未落盘的新建文章不在服务端快照里，轮询刷新时不能把它们从界面踢掉。
    const pending = get().notes.filter((note) => pendingNoteIds.has(note.id) && !snapshot.notes.some((item) => item.id === note.id))
    set({ space: snapshot.space, notes: sortNotes([...snapshot.notes, ...pending]), topics: snapshot.topics, settings: { ...DEFAULT_SETTINGS, ...snapshot.settings } })
  }

  return {
    ready: false,
    error: null,
    space: readActiveSpace(),
    switching: false,
    notes: [],
    topics: [],
    settings: DEFAULT_SETTINGS,
    view: 'home',
    activeNoteId: null,
    topicFilter: 'all',
    searchOpen: false,
    trashOpen: false,
    toast: null,
    initialize: async () => {
      try {
        const requested = readActiveSpace()
        const cachedSpace = localStorage.getItem(CACHE_SPACE_KEY)
        const [cachedNotes, cachedTopics, cachedSettings] = await Promise.all([db.notes.toArray(), db.topics.toArray(), db.settings.get('app')])
        const knownSettings = { ...DEFAULT_SETTINGS, ...(cachedSettings?.value ?? {}) }
        // 本地记住的空间可能已被移除，回退到第一个可用空间
        const space = pickValidSpace(requested, knownSettings.spaces)
        const spaceChanged = !cachedSpace || cachedSpace !== space || requested !== space
        if (spaceChanged) {
          await db.notes.clear()
          await db.topics.clear()
        }
        await initializeDatabase(space)
        await recoverEmergencyDraft()
        const revision = await readRevision(space)
        const [notes, topics, settings] = await Promise.all([db.notes.toArray(), db.topics.toArray(), db.settings.get('app')])
        const snapshot = await mergeLocalSnapshot({ space, notes, topics, settings: { ...DEFAULT_SETTINGS, ...(settings?.value ?? {}) } }, space)
        await cacheSnapshot(snapshot)
        localStorage.setItem(CACHE_SPACE_KEY, space)
        localStorage.setItem(SPACE_KEY, space)
        lastRevision = revision
        lastRevisionSpace = space
        lastBackupCheck = Date.now()
        const nextSettings = { ...DEFAULT_SETTINGS, ...snapshot.settings }
        set({ space: pickValidSpace(space, nextSettings.spaces), notes: sortNotes(snapshot.notes), topics: snapshot.topics, settings: nextSettings, ready: true })
        void ensureDailyBackup().catch(() => { /* Older service or a busy disk: try again later. */ })
      } catch (error) {
        const detail = error instanceof Error ? error.message : '未知错误'
        set({ error: `无法连接随记文件夹的数据服务。请双击“随记.exe”打开应用。${detail}`, ready: true })
      }
    },
    switchSpace: async (next) => {
      const configured = get().settings.spaces
      if (!configured.some((item) => item.id === next)) return
      if (next === get().space || get().switching) return
      set({ switching: true, view: 'home', activeNoteId: null, searchOpen: false, trashOpen: false, topicFilter: 'all' })
      try {
        await db.notes.clear()
        await db.topics.clear()
        await initializeDatabase(next)
        const revision = await readRevision(next)
        const [notes, topics, settings] = await Promise.all([db.notes.toArray(), db.topics.toArray(), db.settings.get('app')])
        const snapshot = await mergeLocalSnapshot({ space: next, notes, topics, settings: { ...DEFAULT_SETTINGS, ...(settings?.value ?? {}) } }, next)
        await cacheSnapshot(snapshot)
        localStorage.setItem(CACHE_SPACE_KEY, next)
        localStorage.setItem(SPACE_KEY, next)
        lastRevision = revision
        lastRevisionSpace = next
        set({ space: next, notes: sortNotes(snapshot.notes), topics: snapshot.topics, settings: { ...DEFAULT_SETTINGS, ...snapshot.settings }, switching: false })
      } catch (error) {
        set({ switching: false })
        notifyError(error, '切换空间失败')
      }
    },
    refreshFromDisk: async (force = false) => {
      try {
        if (get().switching) return
        if (!force && Date.now() - getLastMutationAt() < REFRESH_QUIET_MS) return
        const space = get().space
        const revision = await readRevision(space)
        if (!force && lastRevisionSpace === space && revision !== null && revision === lastRevision) return
        const snapshot = await getSyncSnapshot(space)
        if (get().space !== space) return
        await applySnapshot(snapshot)
        lastRevision = revision
        lastRevisionSpace = space
      } catch {
        // 磁盘短暂占用时保留当前界面；下一轮会再次读取。
      } finally {
        scheduleBackupCheck()
      }
    },
    createNote: async () => {
      try {
        const now = Date.now()
        const space = get().space
        const topicId = get().topicFilter !== 'all' && get().topicFilter !== 'trash' ? get().topicFilter : defaultTopicId(space, get().topics)
        const note: Note = { id: crypto.randomUUID(), title: '', content: '', topicId, tags: [], createdAt: now, updatedAt: now, accumulatedWritingSeconds: 0, wordCount: 0, pinned: false, activeDates: [] }
        pendingNoteIds.add(note.id)
        set((state) => ({ notes: sortNotes([note, ...state.notes]), activeNoteId: note.id, view: 'editor', searchOpen: false }))
        return note
      } catch (error) {
        notifyError(error, '新建文章失败')
        return null
      }
    },
    discardNote: async (id) => {
      const neverPersisted = pendingNoteIds.has(id)
      pendingNoteIds.delete(id)
      clearEmergencyDraft(id, Date.now())
      try {
        if (!neverPersisted) await permanentlyDeleteSyncNote(id, get().space)
        await db.notes.delete(id)
        set((state) => ({ notes: state.notes.filter((note) => note.id !== id), activeNoteId: state.activeNoteId === id ? null : state.activeNoteId }))
      } catch (error) {
        notifyError(error, '丢弃文章失败')
      }
    },
    openNote: (id) => set({ activeNoteId: id, view: 'editor', searchOpen: false, trashOpen: false }),
    goHome: () => set({ view: 'home', activeNoteId: null }),
    saveNote: async (note) => {
      const normalized = { ...note, wordCount: countWords(note.content) }
      await saveSyncNote(normalized, get().space)
      pendingNoteIds.delete(normalized.id)
      await db.notes.put(normalized)
      set((state) => ({ notes: sortNotes([...state.notes.filter((item) => item.id !== normalized.id), normalized]) }))
    },
    setPinned: async (id, pinned) => {
      const note = get().notes.find((item) => item.id === id)
      if (!note) return
      try {
        const updated = { ...note, pinned, updatedAt: Date.now() }
        await saveSyncNote(updated, get().space)
        await db.notes.put(updated)
        set((state) => ({ notes: sortNotes(state.notes.map((item) => item.id === id ? updated : item)) }))
      } catch (error) {
        notifyError(error, '固定状态没有保存')
      }
    },
    moveToTrash: async (id) => {
      const note = get().notes.find((item) => item.id === id)
      if (!note) return false
      try {
        const deletedAt = Date.now()
        const updated = { ...note, deletedAt, updatedAt: deletedAt }
        await saveSyncNote(updated, get().space)
        await db.notes.put(updated)
        set((state) => ({ notes: state.notes.map((item) => item.id === id ? updated : item), view: 'home', activeNoteId: null, toast: '文章已移入回收站' }))
        return true
      } catch (error) {
        notifyError(error, '移入回收站失败')
        return false
      }
    },
    restoreNote: async (id) => {
      const note = get().notes.find((item) => item.id === id)
      if (!note) return
      try {
        const updated = { ...note, deletedAt: undefined, updatedAt: Date.now() }
        await saveSyncNote(updated, get().space)
        await db.notes.put(updated)
        set((state) => ({ notes: sortNotes(state.notes.map((item) => item.id === id ? updated : item)), toast: '文章已恢复' }))
      } catch (error) {
        notifyError(error, '恢复文章失败')
      }
    },
    deleteForever: async (id) => {
      try {
        await permanentlyDeleteSyncNote(id, get().space)
        await db.notes.delete(id)
        set((state) => ({ notes: state.notes.filter((note) => note.id !== id), toast: '文章已永久删除' }))
      } catch (error) {
        notifyError(error, '永久删除失败')
      }
    },
    restoreFromBackup: async (name) => {
      try {
        const result = await restoreSyncBackup(name)
        const space = get().space
        const revision = await readRevision(space)
        const snapshot = await getSyncSnapshot(space)
        await applySnapshot(snapshot)
        lastRevision = revision
        lastRevisionSpace = space
        set({ toast: `已从备份恢复 ${result.notes} 篇文章` })
        return true
      } catch (error) {
        notifyError(error, '从备份恢复失败')
        return false
      }
    },
    setFilter: (topicFilter) => set({ topicFilter }),
    setSearchOpen: (searchOpen) => set({ searchOpen }),
    setTrashOpen: (trashOpen) => set({ trashOpen }),
    setView: (view) => set({ view }),
    updateSettings: async (partial) => {
      try {
        const settings = { ...get().settings, ...partial }
        await saveSyncSettings(settings)
        await db.settings.put({ key: 'app', value: settings })
        set({ settings })
      } catch (error) {
        notifyError(error, '显示设置没有保存')
      }
    },
    addTopic: async (name, color) => {
      try {
        const now = Date.now()
        const topic: Topic = { id: crypto.randomUUID(), name: name.trim(), color, builtIn: false, createdAt: now, updatedAt: now }
        await saveSyncTopic(topic, get().space)
        await db.topics.add(topic)
        set((state) => ({ topics: [...state.topics, topic] }))
      } catch (error) {
        notifyError(error, '新建主题失败')
      }
    },
    updateTopic: async (id, changes) => {
      const topic = get().topics.find((item) => item.id === id)
      if (!topic) return
      try {
        const updated = { ...topic, ...changes, updatedAt: Date.now() }
        await saveSyncTopic(updated, get().space)
        await db.topics.put(updated)
        set((state) => ({ topics: state.topics.map((item) => item.id === id ? updated : item) }))
      } catch (error) {
        notifyError(error, '主题没有保存')
      }
    },
    deleteTopic: async (id) => {
      if (get().topics.find((topic) => topic.id === id)?.builtIn) return
      try {
        const space = get().space
        const fallback = defaultTopicId(space, get().topics.filter((topic) => topic.id !== id))
        const now = Date.now()
        const updatedNotes = get().notes.map((note) => note.topicId === id ? { ...note, topicId: fallback, updatedAt: now } : note)
        await Promise.all(updatedNotes.filter((note) => note.topicId === fallback && get().notes.find((old) => old.id === note.id)?.topicId === id).map((note) => saveSyncNote(note, space)))
        await permanentlyDeleteSyncTopic(id, space)
        await db.transaction('rw', db.topics, db.notes, async () => {
          await db.notes.bulkPut(updatedNotes)
          await db.topics.delete(id)
        })
        set((state) => ({ topics: state.topics.filter((topic) => topic.id !== id), notes: sortNotes(updatedNotes), topicFilter: state.topicFilter === id ? 'all' : state.topicFilter }))
      } catch (error) {
        notifyError(error, '删除主题失败')
      }
    },
    importBackup: async (data) => {
      await createBackup('before-import')
      const importedSettings = { ...DEFAULT_SETTINGS, ...data.settings }
      const space = get().space
      if (data.version === 2 && data.spaces) {
        let count = 0
        for (const target of ['life', 'research'] as const) {
          const part = data.spaces[target]
          if (!part) continue
          count += part.notes.length
          await mergeLocalSnapshot({ space: target, notes: part.notes, topics: part.topics, settings: importedSettings }, target)
        }
        await saveSyncSettings(importedSettings)
        const snapshot = await getSyncSnapshot(space)
        await applySnapshot(snapshot)
        set({ toast: `已合并 ${count} 篇文章` })
        return
      }
      const notes = data.notes ?? []
      const topics = data.topics ?? []
      const researchNotes = notes.filter((note) => note.topicId === 'research')
      const lifeNotes = notes.filter((note) => note.topicId !== 'research')
      const researchTopics = topics.filter((topic) => topic.id === 'research')
      const lifeTopics = topics.filter((topic) => topic.id !== 'research')
      await mergeLocalSnapshot({ space: 'life', notes: lifeNotes, topics: lifeTopics, settings: importedSettings }, 'life')
      await mergeLocalSnapshot({ space: 'research', notes: researchNotes, topics: researchTopics, settings: importedSettings }, 'research')
      await saveSyncSettings(importedSettings)
      const snapshot = await getSyncSnapshot(space)
      await applySnapshot(snapshot)
      set({ toast: `已导入 ${notes.length} 篇文章` })
    },
    showToast: (toast) => set({ toast })
  }
})
