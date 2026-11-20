/** 空间 id：默认是 life / research，用户可以在设置里增删并命名（1-3 个）。 */
export type SpaceId = string

export interface SpaceConfig {
  id: SpaceId
  name: string
}

export interface Note {
  id: string
  title: string
  content: string
  topicId: string
  tags: string[]
  createdAt: number
  updatedAt: number
  accumulatedWritingSeconds: number
  wordCount: number
  pinned: boolean
  activeDates?: string[]
  deletedAt?: number
}

export interface Topic {
  id: string
  name: string
  color: string
  builtIn: boolean
  createdAt: number
  updatedAt?: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type MotionLevel = 'full' | 'reduced' | 'off'
export type AiRange = '7d' | '30d' | '90d' | 'year' | 'all'
export type AiReadingMode = 'excerpt' | 'full'
export type EchoSize = 'small' | 'standard' | 'large'

export interface AppSettings {
  theme: ThemeMode
  fontSize: number
  interfaceFontSize: number
  lineHeight: number
  motion: MotionLevel
  typewriterMode: boolean
  fontDisplay: string
  fontUi: string
  fontMono: string
  fontWriting: string
  aiPersona: string
  aiDefaultRange: AiRange
  aiDefaultMode: AiReadingMode
  echoSize: EchoSize
  showEchoKeywords: boolean
  showHeatmap: boolean
  spaces: SpaceConfig[]
}

export interface SpaceBackup {
  notes: Note[]
  topics: Topic[]
}

export interface BackupData {
  version: 1 | 2
  exportedAt: number
  notes?: Note[]
  topics?: Topic[]
  settings: AppSettings
  spaces?: Partial<Record<string, SpaceBackup>>
}
