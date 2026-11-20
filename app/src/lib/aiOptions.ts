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

/** 任何 OpenAI 兼容 API 都可用；预设只负责填充 Endpoint 和 Model 示例 */
export const AI_PROVIDERS: { id: string; label: string; endpoint: string; model: string }[] = [
  { id: 'opencode', label: 'OpenCode Go', endpoint: 'https://opencode.ai/inference/go/openai/v1/chat/completions', model: 'deepseek-v4.1-flash' },
  { id: 'deepseek', label: 'DeepSeek 官方', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  { id: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'deepseek/deepseek-chat' },
  { id: 'moonshot', label: 'Kimi · 月之暗面', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  { id: 'ollama', label: '本地 Ollama', endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen2.5:7b' },
  { id: 'custom', label: '自定义（OpenAI 兼容）', endpoint: '', model: '' }
]
