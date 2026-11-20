import type { AiRange, AiReadingMode, EchoSize } from '../types'

export const AI_RANGES: { id: AiRange; label: string }[] = [
  { id: '7d', label: '最近 7 天' },
  { id: '30d', label: '最近 30 天' },
  { id: '90d', label: '最近 90 天' },
  { id: 'year', label: '今年' },
  { id: 'all', label: '全部时间' }
]

export const AI_MODES: { id: AiReadingMode; label: string }[] = [
  { id: 'excerpt', label: '精选片段' },
  { id: 'full', label: '完整文章' }
]

export const ECHO_SIZES: { id: EchoSize; label: string }[] = [
  { id: 'small', label: '小' },
  { id: 'standard', label: '标准' },
  { id: 'large', label: '大' }
]
