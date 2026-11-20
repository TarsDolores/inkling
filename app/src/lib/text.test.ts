import { describe, expect, it } from 'vitest'
import { countWords, displayTitle, formatDuration, formatLetterContent, formatRelativeTime } from './text'

describe('countWords', () => {
  it('counts Chinese characters and Latin words/numbers together', () => {
    expect(countWords('今天记录 React 19 和 2026 年计划')).toBe(11)
  })
  it('ignores punctuation and whitespace', () => {
    expect(countWords('你好，世界！\n hello-world...')).toBe(5)
  })
})

describe('displayTitle', () => {
  it('uses the first meaningful content line when title is blank', () => {
    expect(displayTitle({ title: ' ', content: '\n# 第一行想法\n正文' })).toBe('第一行想法')
  })
  it('returns a calm fallback for an empty note', () => {
    expect(displayTitle({ title: '', content: '' })).toBe('无题')
  })
  it('adds an ellipsis instead of cutting a long title silently', () => {
    const title = displayTitle({ title: '', content: '很长'.repeat(30) })
    expect(title).toHaveLength(42)
    expect(title.endsWith('…')).toBe(true)
  })
  it('names a note that begins with a fenced code block', () => {
    expect(displayTitle({ title: '', content: '```ts\nconst value = 1\n```' })).toBe('代码片段')
  })
})

describe('formatRelativeTime', () => {
  it('formats recent time naturally', () => {
    const now = new Date('2026-09-26T12:00:00+08:00').getTime()
    expect(formatRelativeTime(now - 12 * 60_000, now)).toBe('12分钟前')
  })
})

describe('formatLetterContent', () => {
  it('keeps the title flush left and indents every prose paragraph by two Chinese characters', () => {
    expect(formatLetterContent('一封信的标题\n\n第一段文字。\n\n第二段文字。')).toBe('一封信的标题\n\n　　第一段文字。\n\n　　第二段文字。')
  })

  it('preserves common Markdown block syntax and fenced code', () => {
    const source = '# 标题\n\n正文\n\n- 列表\n> 引用\n```ts\nconst value = 1\n```'
    expect(formatLetterContent(source)).toBe('# 标题\n\n　　正文\n\n- 列表\n> 引用\n```ts\nconst value = 1\n```')
  })

  it('does not mistake a leading fenced code block for the title', () => {
    const source = '```ts\nconst value = 1\n```\n\n标题\n正文'
    expect(formatLetterContent(source)).toBe('```ts\nconst value = 1\n```\n\n标题\n　　正文')
  })
})

describe('formatDuration', () => {
  it('uses Chinese units in the editor status', () => {
    expect(formatDuration(30)).toBe('<1 分钟')
    expect(formatDuration(90)).toBe('1 分钟')
    expect(formatDuration(3660)).toBe('1 小时 1 分钟')
  })
})
