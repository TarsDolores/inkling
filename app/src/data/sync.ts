import type { AppSettings, Note, SpaceId, Topic } from '../types'
import { DEFAULT_SETTINGS } from './db'
import { countWords } from '../lib/text'
import { safeFontName } from '../lib/fonts'
import { DEFAULT_AI_PERSONA } from '../lib/aiPersona'

export interface SyncSnapshot {
  space: SpaceId
  notes: Note[]
  topics: Topic[]
  settings: AppSettings
}

export interface BackupInfo {
  name: string
  size: number
  modifiedAt: number
  reason: string
  created?: boolean
}

export interface DailyBackupResult {
  created: boolean
  backup: BackupInfo | null
}

export interface RestoreBackupResult {
  notes: number
  topics: number
  safetyBackup: string
}

export interface AiConfigStatus {
  configured: boolean
  path: string
  endpoint: string
  endpointHost: string
  model: string
  maxTokens: number
  keySource: string
}

export interface AiConfigInput {
  apiKey?: string
  endpoint?: string
  model?: string
  maxTokens?: number
  clearApiKey?: boolean
}

export interface AiTheme {
  name: string
  note: string
}

export interface AiReviewResult {
  title: string
  essence: string
  overview: string
  themes: AiTheme[]
  changes: string[]
  questions: string[]
  quote: string
  gentleNote: string
  raw?: boolean
}

export interface AiReviewRecord {
  id: string
  createdAt: number
  range: string
  rangeLabel: string
  mode: string
  topicId: string
  noteCount: number
  charCount: number
  omitted: number
  model: string
  endpointHost: string
  result: AiReviewResult
}

export interface AiReviewStart {
  id: string
  noteCount: number
  charCount: number
  omitted: number
  rangeLabel: string
  endpointHost: string
}

export type AiReviewStatus =
  | { status: 'running'; elapsed: number }
  | { status: 'done'; review: AiReviewRecord }
  | { status: 'error'; error: string }

let lastMutationAt = 0

/** The last time this tab successfully wrote something to the local service. */
export function getLastMutationAt() {
  return lastMutationAt
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `文件同步服务请求失败（${response.status}）`)
  }
  if (init?.method && init.method !== 'GET') lastMutationAt = Date.now()
  return response.json() as Promise<T>
}

async function requestText(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `文件同步服务请求失败（${response.status}）`)
  }
  return response.text()
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const isSafeId = (value: string) => /^[A-Za-z0-9-]{1,100}$/.test(value)
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function normalizeNote(value: unknown, now = Date.now()): Note | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!isSafeId(id)) return null

  const content = asString(value.content)
  const rawCreatedAt = asNumber(value.createdAt)
  const createdAt = rawCreatedAt !== null && rawCreatedAt > 0 ? rawCreatedAt : now
  const rawUpdatedAt = asNumber(value.updatedAt)
  const updatedAt = rawUpdatedAt !== null && rawUpdatedAt > 0 ? Math.max(rawUpdatedAt, createdAt) : createdAt
  const rawTopicId = asString(value.topicId)
  const rawWordCount = asNumber(value.wordCount)
  const computedWordCount = rawWordCount === null || rawWordCount <= 0 ? countWords(content) : Math.max(0, Math.round(rawWordCount))
  const rawSeconds = asNumber(value.accumulatedWritingSeconds)

  const note: Note = {
    id,
    title: asString(value.title),
    content,
    topicId: isSafeId(rawTopicId) ? rawTopicId : 'fleeting',
    tags: asStringArray(value.tags),
    createdAt,
    updatedAt,
    accumulatedWritingSeconds: rawSeconds === null ? 0 : Math.max(0, Math.round(rawSeconds)),
    wordCount: computedWordCount,
    pinned: value.pinned === true,
    activeDates: asStringArray(value.activeDates).filter(isDateKey)
  }

  const deletedAt = asNumber(value.deletedAt)
  if (deletedAt !== null && deletedAt > 0) note.deletedAt = deletedAt
  return note
}

export function normalizeTopic(value: unknown, now = Date.now()): Topic | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!isSafeId(id)) return null
  const rawCreatedAt = asNumber(value.createdAt)
  const createdAt = rawCreatedAt !== null && rawCreatedAt > 0 ? rawCreatedAt : now
  const rawUpdatedAt = asNumber(value.updatedAt)
  const updatedAt = rawUpdatedAt !== null && rawUpdatedAt > 0 ? Math.max(rawUpdatedAt, createdAt) : createdAt
  const name = asString(value.name).trim() || '未命名主题'
  const color = asString(value.color)

  return {
    id,
    name,
    color: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#708b82',
    builtIn: value.builtIn === true,
    createdAt,
    updatedAt
  }
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS }
  const theme = asString(value.theme)
  const motion = asString(value.motion)
  const fontSize = asNumber(value.fontSize)
  const interfaceFontSize = asNumber(value.interfaceFontSize)
  const lineHeight = asNumber(value.lineHeight)

  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    fontSize: Math.min(32, Math.max(12, Math.round(fontSize ?? DEFAULT_SETTINGS.fontSize))),
    interfaceFontSize: Math.min(20, Math.max(10, Math.round(interfaceFontSize ?? DEFAULT_SETTINGS.interfaceFontSize))),
    lineHeight: Math.min(2.8, Math.max(1.2, Math.round((lineHeight ?? DEFAULT_SETTINGS.lineHeight) * 100) / 100)),
    motion: motion === 'full' || motion === 'reduced' || motion === 'off' ? motion : DEFAULT_SETTINGS.motion,
    typewriterMode: value.typewriterMode === true,
    fontDisplay: safeFontName(asString(value.fontDisplay)),
    fontUi: safeFontName(asString(value.fontUi)),
    fontMono: safeFontName(asString(value.fontMono)),
    fontWriting: safeFontName(asString(value.fontWriting)),
    aiPersona: (() => {
      const persona = asString(value.aiPersona).replace(/\r\n/g, '\n').trim().slice(0, 800)
      return persona || DEFAULT_AI_PERSONA
    })(),
    aiDefaultRange: ['7d', '30d', '90d', 'year', 'all'].includes(asString(value.aiDefaultRange)) ? asString(value.aiDefaultRange) as AppSettings['aiDefaultRange'] : DEFAULT_SETTINGS.aiDefaultRange,
    aiDefaultMode: asString(value.aiDefaultMode) === 'full' ? 'full' : 'excerpt',
    echoSize: asString(value.echoSize) === 'small' || asString(value.echoSize) === 'large' ? asString(value.echoSize) as AppSettings['echoSize'] : 'standard',
    showEchoKeywords: value.showEchoKeywords !== false,
    showHeatmap: value.showHeatmap !== false,
    spaces: (() => {
      const seen = new Set<string>()
      const spaces: AppSettings['spaces'] = []
      if (Array.isArray(value.spaces)) {
        for (const item of value.spaces) {
          if (!isRecord(item)) continue
          const id = asString(item.id)
          if (!/^[a-z][a-z0-9-]{0,19}$/.test(id) || seen.has(id)) continue
          const name = asString(item.name).replace(/\s+/g, ' ').trim().slice(0, 10)
          if (!name) continue
          seen.add(id)
          spaces.push({ id, name })
          if (spaces.length >= 3) break
        }
      }
      return spaces.length ? spaces : DEFAULT_SETTINGS.spaces
    })()
  }
}

export function normalizeSnapshot(value: unknown): SyncSnapshot {
  const raw = isRecord(value) ? value : {}
  const notes = new Map<string, Note>()
  if (Array.isArray(raw.notes)) {
    for (const item of raw.notes) {
      const note = normalizeNote(item)
      if (note) notes.set(note.id, note)
    }
  }
  const topics = new Map<string, Topic>()
  if (Array.isArray(raw.topics)) {
    for (const item of raw.topics) {
      const topic = normalizeTopic(item)
      if (topic) topics.set(topic.id, topic)
    }
  }
  const space = /^[a-z][a-z0-9-]{0,19}$/.test(asString(raw.space)) ? asString(raw.space) : 'life'
  return { space, notes: [...notes.values()], topics: [...topics.values()], settings: normalizeSettings(raw.settings) }
}

export function normalizeBackupInfo(value: unknown): BackupInfo | null {
  if (!isRecord(value)) return null
  const name = asString(value.name)
  if (!/^suiji-backup-[A-Za-z0-9._-]+\.json$/.test(name)) return null
  const size = asNumber(value.size)
  const modifiedAt = asNumber(value.modifiedAt)
  const reason = asString(value.reason, 'backup')
  return {
    name,
    size: size === null ? 0 : Math.max(0, size),
    modifiedAt: modifiedAt === null ? 0 : modifiedAt,
    reason,
    created: value.created === true
  }
}

export async function getSyncSnapshot(space: SpaceId = 'life') {
  return normalizeSnapshot(await request<unknown>(`/api/sync/snapshot?space=${space}`))
}

export async function mergeLocalSnapshot(snapshot: SyncSnapshot, space: SpaceId = snapshot.space) {
  return normalizeSnapshot(await post<unknown>('/api/sync/merge', { ...snapshot, space }))
}

export async function getSyncRevision(space: SpaceId = 'life') {
  const result = await request<{ revision?: unknown }>(`/api/sync/revision?space=${space}`)
  if (typeof result.revision !== 'string' || !result.revision) throw new Error('同步状态无效')
  return result.revision
}

export function saveSyncNote(note: Note, space: SpaceId) {
  return post<{ ok: true }>('/api/sync/note', { ...note, space })
}

export function permanentlyDeleteSyncNote(id: string, space: SpaceId) {
  return post<{ ok: true }>('/api/sync/note/delete', { id, deletedAt: Date.now(), space })
}

export function saveSyncTopic(topic: Topic, space: SpaceId) {
  return post<{ ok: true }>('/api/sync/topic', { ...topic, space })
}

export function permanentlyDeleteSyncTopic(id: string, space: SpaceId) {
  return post<{ ok: true }>('/api/sync/topic/delete', { id, deletedAt: Date.now(), space })
}

export function saveSyncSettings(settings: AppSettings) {
  return post<{ ok: true }>('/api/sync/settings', { value: settings, updatedAt: Date.now() })
}

export async function getBackups() {
  const result = await request<{ backups?: unknown }>('/api/backup/list')
  if (!Array.isArray(result.backups)) return []
  return result.backups.map(normalizeBackupInfo).filter((item): item is BackupInfo => item !== null)
}

export async function createBackup(reason = 'manual') {
  const result = await post<{ backup?: unknown }>('/api/backup/create', { reason })
  const backup = normalizeBackupInfo(result.backup)
  if (!backup) throw new Error('备份服务返回了无效数据')
  return backup
}

export async function ensureDailyBackup(): Promise<DailyBackupResult> {
  const result = await post<{ created?: unknown; backup?: unknown }>('/api/backup/daily', {})
  return { created: result.created === true, backup: normalizeBackupInfo(result.backup) }
}

export async function restoreBackup(name: string): Promise<RestoreBackupResult> {
  const result = await post<Record<string, unknown>>('/api/backup/restore', { name })
  return {
    notes: typeof result.notes === 'number' ? result.notes : 0,
    topics: typeof result.topics === 'number' ? result.topics : 0,
    safetyBackup: asString(result.safetyBackup)
  }
}

export function getBackupText(name: string) {
  return requestText(`/api/backup/file?name=${encodeURIComponent(name)}`)
}

function normalizeAiConfig(value: unknown): AiConfigStatus {
  const raw = isRecord(value) ? value : {}
  return {
    configured: raw.configured === true,
    path: asString(raw.path),
    endpoint: asString(raw.endpoint),
    endpointHost: asString(raw.endpointHost),
    model: asString(raw.model),
    maxTokens: Math.max(0, Math.round(asNumber(raw.maxTokens) ?? 32000)),
    keySource: asString(raw.keySource)
  }
}

function normalizeAiReviewResult(value: unknown): AiReviewResult {
  const raw = isRecord(value) ? value : {}
  const themes: AiTheme[] = []
  if (Array.isArray(raw.themes)) {
    for (const item of raw.themes) {
      if (typeof item === 'string') {
        if (item.trim()) themes.push({ name: item.trim(), note: '' })
      } else if (isRecord(item)) {
        const name = asString(item.name).trim()
        if (name) themes.push({ name, note: asString(item.note).trim() })
      }
    }
  }
  return {
    title: asString(raw.title).trim() || '这段时间的回声',
    essence: asString(raw.essence).trim(),
    overview: asString(raw.overview).trim(),
    themes: themes.slice(0, 6),
    changes: asStringArray(raw.changes).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    questions: asStringArray(raw.questions).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    quote: asString(raw.quote).trim(),
    gentleNote: asString(raw.gentleNote).trim(),
    raw: raw.raw === true
  }
}

function normalizeAiReview(value: unknown): AiReviewRecord | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!id) return null
  return {
    id,
    createdAt: asNumber(value.createdAt) ?? 0,
    range: asString(value.range, '30d'),
    rangeLabel: asString(value.rangeLabel, 'AI 回顾'),
    mode: asString(value.mode, 'excerpt'),
    topicId: asString(value.topicId, 'all'),
    noteCount: Math.max(0, Math.round(asNumber(value.noteCount) ?? 0)),
    charCount: Math.max(0, Math.round(asNumber(value.charCount) ?? 0)),
    omitted: Math.max(0, Math.round(asNumber(value.omitted) ?? 0)),
    model: asString(value.model),
    endpointHost: asString(value.endpointHost),
    result: normalizeAiReviewResult(value.result)
  }
}

function normalizeAiReviewStart(value: unknown): AiReviewStart {
  const raw = isRecord(value) ? value : {}
  const id = asString(raw.id)
  if (!id) throw new Error('AI 回顾没有返回任务编号')
  return {
    id,
    noteCount: Math.max(0, Math.round(asNumber(raw.noteCount) ?? 0)),
    charCount: Math.max(0, Math.round(asNumber(raw.charCount) ?? 0)),
    omitted: Math.max(0, Math.round(asNumber(raw.omitted) ?? 0)),
    rangeLabel: asString(raw.rangeLabel, 'AI 回顾'),
    endpointHost: asString(raw.endpointHost)
  }
}

function normalizeAiReviewStatus(value: unknown): AiReviewStatus {
  const raw = isRecord(value) ? value : {}
  const status = asString(raw.status)
  if (status === 'done') {
    const review = normalizeAiReview(raw.review)
    if (review) return { status: 'done', review }
  }
  if (status === 'error') return { status: 'error', error: asString(raw.error, 'AI 回顾生成失败') }
  return { status: 'running', elapsed: Math.max(0, Math.round(asNumber(raw.elapsed) ?? 0)) }
}

export async function getAiConfig() {
  return normalizeAiConfig(await request<unknown>('/api/ai/config'))
}

export async function saveAiConfig(payload: AiConfigInput) {
  return normalizeAiConfig(await post<unknown>('/api/ai/config', payload))
}

export async function getAiReviews() {
  const result = await request<{ reviews?: unknown }>('/api/ai/reviews')
  if (!Array.isArray(result.reviews)) return []
  return result.reviews.map(normalizeAiReview).filter((item): item is AiReviewRecord => item !== null)
}

export async function getSystemFonts(): Promise<string[]> {
  const result = await request<{ fonts?: unknown }>('/api/fonts')
  if (!Array.isArray(result.fonts)) return []
  return [...new Set(result.fonts
    .filter((item): item is string => typeof item === 'string')
    .map((item) => safeFontName(item))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export async function startAiReview(payload: { range: string; mode: string; topicId: string; persona?: string }) {
  return normalizeAiReviewStart(await post<unknown>('/api/ai/review', payload))
}

export async function getAiReviewStatus(id: string) {
  return normalizeAiReviewStatus(await request<unknown>(`/api/ai/review/status?id=${encodeURIComponent(id)}`))
}

export function deleteAiReview(id: string) {
  return post<{ ok: true }>('/api/ai/review/delete', { id })
}
