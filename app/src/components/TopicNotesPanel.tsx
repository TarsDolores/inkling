import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FilePlus2, X } from 'lucide-react'
import { displayTitle, formatFullTime, formatRelativeTime, noteExcerpt } from '../lib/text'
import { useAppStore } from '../store/useAppStore'
import type { Topic } from '../types'
import { IconButton } from './IconButton'

interface Props {
  topic: Topic | null
  onClose: () => void
}

export function TopicNotesPanel({ topic, onClose }: Props) {
  const { notes, openNote, createNote } = useAppStore()
  const topicNotes = useMemo(() => topic ? notes
    .filter((note) => !note.deletedAt && note.topicId === topic.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt) : [], [notes, topic])

  useEffect(() => {
    if (!topic) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [topic, onClose])

  return <AnimatePresence>
    {topic && <motion.div className="topic-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="topic-notes-panel" role="dialog" aria-modal="true" aria-label={`${topic.name}主题文章`} initial={{ x: 36, opacity: 0, scale: .985 }} animate={{ x: 0, opacity: 1, scale: 1 }} exit={{ x: 22, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
        <header>
          <div><h2>{topic.name}</h2></div>
          <IconButton label="关闭主题文章" onClick={onClose}><X size={19} /></IconButton>
        </header>

        <div className="topic-panel-list">
          {topicNotes.length ? topicNotes.map((note) => <motion.button key={note.id} className="topic-panel-note" onClick={() => openNote(note.id)} whileHover={{ x: 3 }}>
            <span className="topic-panel-note-copy"><strong>{displayTitle(note)}</strong><small>{noteExcerpt(note, 100) || (note.content.trim() ? '只有标题' : '空白文章')}</small></span>
            <span className="topic-panel-note-meta"><time title={formatFullTime(note.updatedAt)}>{formatRelativeTime(note.updatedAt)}</time><b>{note.wordCount.toLocaleString('zh-CN')} 字</b></span>
          </motion.button>) : <div className="topic-panel-empty"><span style={{ backgroundColor: topic.color }} /><p>这个主题下还没有文字</p></div>}
        </div>

        <footer><button className="topic-new-note" onClick={() => void createNote()}><FilePlus2 size={16} /><span>在“{topic.name}”中新建</span></button></footer>
      </motion.section>
    </motion.div>}
  </AnimatePresence>
}
