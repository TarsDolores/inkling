import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, ChevronDown, Download, MoreHorizontal, Pin, Search, Trash2 } from 'lucide-react'
import { clearEmergencyDraft, storeEmergencyDraft } from '../data/db'
import { exportNote } from '../lib/export'
import { countWords, formatDuration, formatFullTime, formatLetterContent, formatRelativeTime } from '../lib/text'
import { localDateKey } from '../lib/stats'
import { centerCaretInTextarea, createTypewriterMirror } from '../lib/typewriter'
import { useAppStore } from '../store/useAppStore'
import type { Note } from '../types'
import { IconButton } from '../components/IconButton'
import { ThemeToggle } from '../components/ThemeToggle'

type SaveState = 'saved' | 'saving' | 'failed'

function asLetterDraft(note: Note): Note {
  const title = note.title.trim()
  const contentAlreadyStartsWithTitle = title && (note.content.trimStart() === title || note.content.trimStart().startsWith(`${title}\n`))
  const mergedContent = !title || contentAlreadyStartsWithTitle ? note.content : note.content.trim() ? `${title}\n\n${note.content}` : title
  const content = formatLetterContent(mergedContent)
  if (!title && content === note.content) return note
  return { ...note, title: '', content, wordCount: countWords(content) }
}

function isEmptyDraft(note: Note | null): note is Note {
  if (!note) return false
  return !note.title.trim() && !note.content.trim() && note.tags.length === 0
}

export function Editor() {
  const store = useAppStore()
  const source = store.notes.find((item) => item.id === store.activeNoteId)
  const [draft, setDraft] = useState<Note | null>(source ? asLetterDraft(source) : null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [topicMenuOpen, setTopicMenuOpen] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)
  const lastInputAt = useRef(0)
  const lastTick = useRef(Date.now())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const latestDraft = useRef<Note | null>(draft)
  const isComposing = useRef(false)
  const everHadContent = useRef(!isEmptyDraft(draft))

  useEffect(() => {
    if (source) {
      const previous = latestDraft.current
      if (previous && previous.id !== source.id && !everHadContent.current && isEmptyDraft(previous)) {
        latestDraft.current = null
        void store.discardNote(previous.id)
      }
      const prepared = asLetterDraft(source)
      everHadContent.current = !isEmptyDraft(prepared)
      setDraft(prepared)
      latestDraft.current = prepared
    }
  }, [source?.id])

  const persist = useCallback(async (note?: Note | null) => {
    const current = note ?? latestDraft.current
    if (!current || isComposing.current) return false
    setSaveState('saving')
    try {
      await store.saveNote(current)
      clearEmergencyDraft(current.id, current.updatedAt)
      setSaveState('saved')
      return true
    } catch {
      setSaveState('failed')
      store.showToast('保存失败，草稿仍保留在浏览器中')
      return false
    }
  }, [store.saveNote, store.showToast])

  const queueSave = useCallback((next: Note) => {
    latestDraft.current = next
    setSaveState('saving')
    window.clearTimeout(saveTimer.current)
    if (isEmptyDraft(next) && !everHadContent.current) {
      // 新建后还没有写过任何字：留在内存里，等第一个字再真正落盘。
      setSaveState('saved')
      return
    }
    storeEmergencyDraft(next)
    if (!isComposing.current) saveTimer.current = window.setTimeout(() => void persist(next), 650)
  }, [persist])

  const updateDraft = (changes: Partial<Note>, countsAsTyping = true) => {
    if (!latestDraft.current) return
    const next = { ...latestDraft.current, ...changes, updatedAt: Date.now() }
    if (countsAsTyping) {
      const today = localDateKey(new Date())
      next.activeDates = next.activeDates?.includes(today) ? next.activeDates : [...(next.activeDates ?? []), today]
    }
    next.wordCount = countWords(next.content)
    if (!isEmptyDraft(next)) everHadContent.current = true
    setDraft(next)
    queueSave(next)
    if (countsAsTyping) {
      lastInputAt.current = Date.now()
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setChromeVisible(false), 2600)
    }
  }

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now()
      const elapsed = Math.min(2, Math.floor((now - lastTick.current) / 1000))
      lastTick.current = now
      if (elapsed > 0 && document.visibilityState === 'visible' && document.hasFocus() && now - lastInputAt.current <= 60_000 && latestDraft.current) {
        const next = { ...latestDraft.current, accumulatedWritingSeconds: latestDraft.current.accumulatedWritingSeconds + elapsed }
        setDraft(next); latestDraft.current = next
      }
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const discardIfUntouched = () => {
    const current = latestDraft.current
    if (!current || everHadContent.current || !isEmptyDraft(current)) return false
    window.clearTimeout(saveTimer.current)
    latestDraft.current = null
    void store.discardNote(current.id)
    return true
  }

  const leaveEditor = async () => {
    if (discardIfUntouched()) {
      store.goHome()
      return
    }
    await persist()
    store.goHome()
  }

  useEffect(() => {
    const flush = () => {
      if (discardIfUntouched()) return
      if (latestDraft.current) {
        storeEmergencyDraft(latestDraft.current)
        void persist(latestDraft.current)
      }
    }
    const reveal = () => setChromeVisible(true)
    const onKey = (event: KeyboardEvent) => {
      reveal()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); window.clearTimeout(saveTimer.current); void persist() }
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    window.addEventListener('mousemove', reveal, { passive: true })
    window.addEventListener('touchstart', reveal, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      flush(); window.clearTimeout(saveTimer.current); window.clearTimeout(hideTimer.current)
      window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); window.removeEventListener('mousemove', reveal); window.removeEventListener('touchstart', reveal); window.removeEventListener('keydown', onKey)
    }
  }, [persist])

  useEffect(() => {
    if (!store.settings.typewriterMode || !textareaRef.current) return
    const textarea = textareaRef.current
    const mirror = createTypewriterMirror()
    let frame = 0
    const center = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => centerCaretInTextarea(textarea, mirror))
    }
    const onSelectionChange = () => {
      if (document.activeElement === textarea) center()
    }
    textarea.addEventListener('input', center)
    textarea.addEventListener('keyup', center)
    textarea.addEventListener('click', center)
    textarea.addEventListener('select', center)
    textarea.addEventListener('focus', center)
    document.addEventListener('selectionchange', onSelectionChange)
    center()
    return () => {
      window.cancelAnimationFrame(frame)
      textarea.removeEventListener('input', center)
      textarea.removeEventListener('keyup', center)
      textarea.removeEventListener('click', center)
      textarea.removeEventListener('select', center)
      textarea.removeEventListener('focus', center)
      document.removeEventListener('selectionchange', onSelectionChange)
      mirror.remove()
    }
  }, [store.settings.typewriterMode, draft?.id])

  useEffect(() => {
    if (!menuOpen && !topicMenuOpen) return
    const closeOnPointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.editor-menu') || target.closest('.topic-menu') || target.closest('.topic-selector') || target.closest('[aria-label="更多操作"]')) return
      setMenuOpen(false)
      setTopicMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenuOpen(false)
      setTopicMenuOpen(false)
    }
    window.addEventListener('mousedown', closeOnPointer)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('mousedown', closeOnPointer)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [menuOpen, topicMenuOpen])

  const topic = store.topics.find((item) => item.id === draft?.topicId)
  const createdDescription = draft ? `创建于 ${formatFullTime(draft.createdAt)} · 最近编辑 ${formatRelativeTime(draft.updatedAt)}` : ''
  const saveLabel = saveState === 'saving' ? '正在记录…' : saveState === 'failed' ? '保存失败' : '已保存'

  if (!draft) return <main className="editor-missing"><p>这篇文章已经不在了。</p><button onClick={store.goHome}>返回首页</button></main>

  const moveCurrentToTrash = async () => {
    window.clearTimeout(saveTimer.current)
    if (!everHadContent.current && isEmptyDraft(draft)) {
      latestDraft.current = null
      await store.discardNote(draft.id)
      store.goHome()
      return
    }
    if (!(await persist(draft))) return
    if (await store.moveToTrash(draft.id)) latestDraft.current = null
  }

  const updateLetterContent = (element: HTMLTextAreaElement, composing = isComposing.current) => {
    const rawContent = element.value
    const selectionStart = element.selectionStart
    const selectionEnd = element.selectionEnd
    // Changing the value or caret during IME composition commits unfinished pinyin.
    const content = composing ? rawContent : formatLetterContent(rawContent)
    updateDraft({ content, title: '' })
    if (content !== rawContent) {
      const nextSelectionStart = formatLetterContent(rawContent.slice(0, selectionStart)).length
      const nextSelectionEnd = formatLetterContent(rawContent.slice(0, selectionEnd)).length
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea && document.activeElement === textarea && !isComposing.current && textarea.value === content) {
          textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd)
        }
      })
    }
  }

  return (
    <main className={`editor-page ${chromeVisible ? 'chrome-visible' : 'chrome-hidden'}`}>
      <motion.header className="editor-header" animate={{ opacity: chromeVisible ? 1 : .1 }}>
        <div className="editor-header-side"><IconButton label="返回首页" onClick={() => void leaveEditor()}><ArrowLeft size={20} /></IconButton><button className="topic-selector" aria-haspopup="menu" aria-expanded={topicMenuOpen} aria-controls="topic-menu" onClick={() => { setMenuOpen(false); setTopicMenuOpen((open) => !open) }}><i style={{ backgroundColor: topic?.color }} /><span className="topic-selector-name">{topic?.name}</span><ChevronDown size={14} /></button></div>
        <div className="writing-status" title={createdDescription}>
          <motion.span key={draft.wordCount} initial={{ y: -5, opacity: .4 }} animate={{ y: 0, opacity: 1 }}>{draft.wordCount.toLocaleString('zh-CN')} 字</motion.span><b>·</b><span>{formatDuration(draft.accumulatedWritingSeconds)}</span><b>·</b><span className={`save-state ${saveState}`}>{saveState === 'saved' && <i />} {saveLabel}</span>
        </div>
        <div className="editor-header-side right"><ThemeToggle /><IconButton label="搜索" onClick={() => store.setSearchOpen(true)}><Search size={18} /></IconButton><IconButton label="更多操作" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="editor-menu" onClick={() => { setTopicMenuOpen(false); setMenuOpen((open) => !open) }}><MoreHorizontal size={20} /></IconButton></div>
      </motion.header>

      <AnimatePresence>{topicMenuOpen && <motion.div id="topic-menu" className="editor-menu topic-menu" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }}>
        <div className="menu-topics">{store.topics.map((item) => <button key={item.id} className={item.id === draft.topicId ? 'selected' : ''} onClick={() => { updateDraft({ topicId: item.id }, false); setTopicMenuOpen(false) }}><i style={{ background: item.color }} />{item.name}{item.id === draft.topicId && <Check size={14} />}</button>)}</div>
      </motion.div>}</AnimatePresence>

      <AnimatePresence>{menuOpen && <motion.div id="editor-menu" className="editor-menu" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }}>
        <button onClick={() => updateDraft({ pinned: !draft.pinned }, false)}><Pin size={16} />{draft.pinned ? '取消固定' : '固定文章'}</button>
        <div className="export-row"><Download size={16} /><span>导出</span>{(['md', 'txt', 'html'] as const).map((format) => <button key={format} onClick={() => exportNote(draft, format)}>{format.toUpperCase()}</button>)}</div>
        <button className="danger" onClick={() => void moveCurrentToTrash()}><Trash2 size={16} />移入回收站</button>
      </motion.div>}</AnimatePresence>

      <section className="editor-canvas">
        <motion.div className="editor-paper" layoutId={`card-${draft.id}`}>
          <textarea ref={textareaRef} className="content-input" value={draft.content}
            onCompositionStart={() => { isComposing.current = true; window.clearTimeout(saveTimer.current) }}
            onCompositionEnd={(event) => { isComposing.current = false; updateLetterContent(event.currentTarget, false) }}
            onChange={(event) => updateLetterContent(event.currentTarget, isComposing.current || (event.nativeEvent as InputEvent).isComposing)}
            placeholder="第一行写标题，换行后开始正文…" aria-label="文章正文" spellCheck autoFocus />
          <footer className="document-time" title={createdDescription}><time>创建于 {formatRelativeTime(draft.createdAt)}</time>{draft.updatedAt !== draft.createdAt && <><span>·</span><span>编辑于 {formatRelativeTime(draft.updatedAt)}</span></>}</footer>
        </motion.div>
      </section>
    </main>
  )
}
