import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyRound, LoaderCircle, Quote, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import {
  deleteAiReview,
  getAiConfig,
  getAiReviewStatus,
  getAiReviews,
  startAiReview,
  type AiConfigStatus,
  type AiReviewRecord
} from '../data/sync'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_AI_PERSONA } from '../lib/aiPersona'
import { IconButton } from './IconButton'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })

function rangeStart(range: string) {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'year') return new Date(now.getFullYear(), 0, 1).getTime()
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  return now.getTime() - days * 86_400_000
}

function splitSentences(text: string) {
  return (text.replace(/\s+/g, ' ').match(/[^。！？!?]+[。！？!?]?/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean)
}

function clipText(text: string, max: number) {
  const clean = text.trim()
  return clean.length > max ? `${clean.slice(0, max).replace(/[，、；：\s]+$/, '')}…` : clean
}

function compactOverview(text: string) {
  return clipText(splitSentences(text).slice(0, 3).join(''), 110)
}

const STOP_WORDS = new Set([
  '今天', '自己', '一个', '什么', '没有', '就是', '这个', '那个', '觉得', '时候',
  '还是', '已经', '可以', '因为', '所以', '但是', '我们', '他们', '一些', '有点',
  '真的', '其实', '东西', '事情', '感觉', '心里', '可能', '如果', '现在', '开始',
  '看到', '写下', '一下', '这样', '那样', '不是', '还有', '之后', '之前', '一点',
  '很多', '非常', '比较', '应该', '需要', '这里', '那里', '知道', '起来', '出来',
  '然后', '我的', '你的', '问题', '喜欢', '生活', '时间', '思考', '明天', '昨天', '最近', '一定', '这种', '那种', '对于', '一种', '一直', '无法', '不会'
])

type SegmenterLike = { segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }> }
const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'word' }) => SegmenterLike }).Segmenter

function extractKeywords(notes: { title: string; content: string }[], themes: { name: string }[]) {
  if (!SegmenterCtor) return []
  const segmenter = new SegmenterCtor('zh-CN', { granularity: 'word' })
  const blocked = new Set(themes.map((theme) => theme.name))
  const counts = new Map<string, number>()
  for (const note of notes) {
    const text = `${note.title}\n${note.content}`.slice(0, 20_000)
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike === false) continue
      const word = part.segment.trim()
      if (!/^[\u3400-\u9fff]{2,4}$/.test(word)) continue
      if (STOP_WORDS.has(word) || blocked.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }))
}

function isLegacyRaw(review: AiReviewRecord) {
  return review.result.raw === true && review.result.overview.trim().startsWith('{')
}

export function AiReviewCard() {
  const { notes, showToast, settings, setView } = useAppStore()
  const [config, setConfig] = useState<AiConfigStatus | null>(null)
  const [reviews, setReviews] = useState<AiReviewRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [nextConfig, nextReviews] = await Promise.all([getAiConfig(), getAiReviews()])
      if (!mounted.current) return
      setConfig(nextConfig)
      setReviews(nextReviews)
      setLoadError('')
    } catch (reason) {
      if (mounted.current) setLoadError(reason instanceof Error ? reason.message : '暂时无法读取 AI 回顾')
    } finally {
      if (mounted.current && showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(false) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  const latest = reviews[0] ?? null
  const legacyRaw = latest ? isLegacyRaw(latest) : false
  const displayEssence = latest?.result.essence ? clipText(latest.result.essence, 36) : ''
  const displayOverview = latest
    ? compactOverview(latest.result.overview)
    : ''
  const displayThemes = latest ? latest.result.themes.slice(0, 3) : []
  const displayQuestion = latest ? clipText(latest.result.questions[0] ?? '', 34) : ''
  const displayQuote = latest ? clipText(latest.result.quote, 48) : ''
  const displayGentle = latest ? clipText(latest.result.gentleNote, 24) : ''
  const closingNote = /自伤|自杀|绝望|危机|紧急|求助|联系信任|热线/.test(displayGentle) ? displayGentle : ''
  const keywordNotes = useMemo(() => {
    if (!latest) return []
    const cutoff = rangeStart(latest.range)
    return notes.filter((note) => !note.deletedAt && (cutoff === null || note.createdAt >= cutoff))
  }, [notes, latest])
  const keywords = useMemo(() => latest ? extractKeywords(keywordNotes, latest.result.themes) : [], [keywordNotes, latest])

  const generate = async () => {
    if (!config?.configured || busy) return
    setBusy(true)
    setError('')
    setStatus('正在提交这次回顾…')
    try {
      const job = await startAiReview({ range: settings.aiDefaultRange, mode: settings.aiDefaultMode, topicId: 'all', persona: settings.aiPersona || DEFAULT_AI_PERSONA })
      setStatus(`正在读 ${job.noteCount} 篇文章…`)
      const deadline = Date.now() + 190_000
      while (mounted.current) {
        const next = await getAiReviewStatus(job.id)
        if (!mounted.current) return
        if (next.status === 'done') {
          setReviews((current) => [next.review, ...current.filter((review) => review.id !== next.review.id)].slice(0, 20))
          setStatus('')
          setError('')
          showToast('回声已生成')
          return
        }
        if (next.status === 'error') {
          setStatus('')
          setError(next.error)
          return
        }
        setStatus(`正在读你的文字… ${Math.max(1, next.elapsed)} 秒`)
        if (Date.now() > deadline) throw new Error('生成时间过长，请稍后再试。')
        await new Promise((resolve) => window.setTimeout(resolve, 1200))
      }
    } catch (reason) {
      if (mounted.current) {
        setStatus('')
        setError(reason instanceof Error ? reason.message : '生成失败，请稍后再试')
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const removeReview = async (review: AiReviewRecord) => {
    if (!window.confirm('删除这页回声？')) return
    try {
      await deleteAiReview(review.id)
      setReviews((current) => current.filter((item) => item.id !== review.id))
      showToast('回声已删除')
    } catch (reason) {
      showToast(reason instanceof Error ? `删除失败：${reason.message}` : '删除回声失败')
    }
  }

  const goToSettings = () => setView('settings')

  return (
    <section className={`ai-review-panel echo-size-${settings.echoSize}`} aria-label="AI 回声">
        <header className="ai-review-head">
          <div className="ai-review-heading">
            {loading ? <h2>正在读取回声</h2> : latest ? <h2>{legacyRaw ? '这页回声来自旧版本' : latest.result.title}</h2> : <h2>{config?.configured ? '让 AI 读一读这段时间' : '给文字留一页回声'}</h2>}
            {latest && !loading && (
              <div className="ai-review-meta">
                <span>{latest.rangeLabel} · {dateFormatter.format(new Date(latest.createdAt))} · {latest.noteCount} 篇{latest.omitted > 0 ? ` / 省略 ${latest.omitted} 篇` : ''}</span>
                {!config?.configured && <span className="ai-readonly"><KeyRound size={11} />仅查看 · 本机未配置 Key</span>}
              </div>
            )}
          </div>
          <div className="ai-review-actions">
            {latest && config?.configured && <button type="button" className="terminal-button" disabled={busy} onClick={() => void generate()}>{busy ? <LoaderCircle size={13} className="ai-spin" /> : <RefreshCw size={13} />}{busy ? '正在读…' : '重新生成'}</button>}
            {latest && !config?.configured && <button type="button" className="terminal-button primary" onClick={goToSettings}><KeyRound size={13} />配置 Key</button>}
            {!latest && !loading && <button type="button" className="terminal-button primary" disabled={busy} onClick={config?.configured ? () => void generate() : goToSettings}>{busy ? <LoaderCircle size={13} className="ai-spin" /> : <Sparkles size={13} />}{busy ? '正在读…' : config?.configured ? '生成第一页' : '配置 Key'}</button>}
            {latest && <IconButton className="ai-delete-button" label="删除这页回声" onClick={() => void removeReview(latest)}><Trash2 size={15} /></IconButton>}
          </div>
        </header>

        {!loading && !loadError && (busy || status) && <div className="ai-inline-status"><LoaderCircle size={14} className="ai-spin" /><span>{status || '正在生成…'}</span></div>}
        {!loading && !loadError && error && <div className="ai-inline-error">{error}</div>}

        {loading && <div className="ai-loading"><LoaderCircle size={15} className="ai-spin" />正在读取最近一页回声…</div>}
        {!loading && loadError && <div className="ai-empty"><p>{loadError}</p><button type="button" className="terminal-button" onClick={() => void load()}>重试</button></div>}

        {!loading && !loadError && latest && legacyRaw && (
          <div className="ai-legacy">
            <p>这页回声是旧版本模型返回的原始内容，没有完整结构。删除后重新生成，就能得到正常的标题、主题和变化。</p>
            <div className="ai-legacy-actions">
              <button type="button" className="terminal-button" onClick={() => void removeReview(latest)}>删除这页</button>
              {config?.configured && <button type="button" className="terminal-button primary" disabled={busy} onClick={() => void generate()}>{busy ? <><LoaderCircle size={13} className="ai-spin" />正在读…</> : '重新生成'}</button>}
            </div>
          </div>
        )}

        {!loading && !loadError && latest && !legacyRaw && (
          <div className="ai-review-body ai-review-body-compact">
            {displayEssence && (
              <div className="ai-essence">
                <span className="ai-essence-mark" aria-hidden="true">“</span>
                <p>{displayEssence}</p>
              </div>
            )}

            {displayOverview && <p className="ai-short-overview">{displayOverview}</p>}

            {(displayThemes.length > 0 || displayQuestion || (settings.showEchoKeywords && keywords.length > 0)) && (
              <div className={`ai-compact-grid${displayThemes.length || (settings.showEchoKeywords && keywords.length) ? '' : ' single'}`}>
                {(displayThemes.length > 0 || (settings.showEchoKeywords && keywords.length > 0)) && (
                  <div className="ai-theme-stack">
                    {displayThemes.length > 0 && (
                      <div className="ai-keywords">
                        {displayThemes.map((theme) => <span className="ai-keyword" key={theme.name} title={theme.note || undefined}>#{theme.name}</span>)}
                      </div>
                    )}
                    {settings.showEchoKeywords && keywords.length > 0 && (
                      <div className="ai-word-block">
                        <span>反复写到</span>
                        <div className="ai-word-list">
                          {keywords.map((keyword) => <span key={keyword.word} title={`出现 ${keyword.count} 次`}>{keyword.word}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {displayQuestion && <div className="ai-question"><p>{displayQuestion}</p></div>}
              </div>
            )}

            {displayQuote && <blockquote className="ai-quote ai-quote-compact"><Quote size={16} /><p>“{displayQuote}”</p></blockquote>}

            {closingNote && <p className="ai-closing">{closingNote}</p>}
          </div>
        )}

        {!loading && !loadError && !latest && (
          <div className="ai-empty">
            {!config?.configured && <p>在 设置 → AI 里粘贴一次 API Key，就能生成。</p>}
            <button type="button" className="terminal-button primary" disabled={busy} onClick={config?.configured ? () => void generate() : goToSettings}>{busy ? <LoaderCircle size={13} className="ai-spin" /> : <Sparkles size={13} />}{busy ? '正在读…' : config?.configured ? '生成第一页' : '配置 Key'}</button>
          </div>
        )}
      </section>
  )
}
