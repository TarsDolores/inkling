import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { displayTitle, noteExcerpt, formatRelativeTime } from '../lib/text'
import { IconButton } from './IconButton'

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</>
}

export function SearchPalette() {
  const { searchOpen, setSearchOpen, notes, topics, openNote } = useAppStore()
  const [query, setQuery] = useState('')
  const [topicId, setTopicId] = useState('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => inputRef.current?.focus())
    else { setQuery(''); setTopicId('all') }
  }, [searchOpen])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSearchOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [setSearchOpen])

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return notes.filter((note) => !note.deletedAt && (topicId === 'all' || note.topicId === topicId) && (!needle || `${note.title}\n${note.content}\n${note.tags.join(' ')}`.toLocaleLowerCase().includes(needle))).slice(0, 20)
  }, [query, topicId, notes])

  return (
    <AnimatePresence>
      {searchOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
        <motion.section className="search-panel" role="dialog" aria-modal="true" aria-label="搜索文章" initial={{ opacity: 0, y: -18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .98 }}>
          <div className="search-box"><Search size={19} /><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、正文或标签" aria-label="搜索" /><kbd>ESC</kbd><IconButton label="关闭搜索" onClick={() => setSearchOpen(false)}><X size={18} /></IconButton></div>
          <div className="search-topics" aria-label="按主题筛选"><button className={topicId === 'all' ? 'active' : ''} onClick={() => setTopicId('all')}>全部</button>{topics.map((topic) => <button key={topic.id} className={topicId === topic.id ? 'active' : ''} onClick={() => setTopicId(topic.id)}><i style={{ background: topic.color }} /><span>{topic.name}</span></button>)}</div>
          <div className="search-results">
            {results.map((note) => <button key={note.id} className="search-result" onClick={() => openNote(note.id)}><span><strong><Highlight text={displayTitle(note)} query={query} /></strong><small><Highlight text={noteExcerpt(note, 90) || (note.content.trim() ? '只有标题' : '空白文章')} query={query} /></small></span><time>{formatRelativeTime(note.updatedAt)}</time></button>)}
            {!results.length && <div className="empty-search"><Search size={24} /><p>没有找到相关文字</p></div>}
          </div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>
  )
}
