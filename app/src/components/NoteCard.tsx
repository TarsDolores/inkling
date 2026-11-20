import { motion } from 'framer-motion'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note, Topic } from '../types'
import { displayTitle, noteExcerpt, formatFullTime, formatRelativeTime } from '../lib/text'
import { IconButton } from './IconButton'

interface Props {
  note: Note
  topic?: Topic
  onOpen: () => void
  onPin: () => void
  onDelete: () => void
  compact?: boolean
}

export function NoteCard({ note, topic, onOpen, onPin, onDelete, compact = false }: Props) {
  return (
    <motion.article className={`note-card ${compact ? 'compact' : ''}`} layout layoutId={`card-${note.id}`} whileHover={compact ? undefined : { y: -2 }} exit={{ opacity: 0, y: -7, scale: .985 }} transition={{ duration: .18 }}>
      <button className="note-card-main" onClick={onOpen} aria-label={`打开文章：${displayTitle(note)}`}>
        <motion.h3>{displayTitle(note)}</motion.h3>
        {(noteExcerpt(note) || note.content.trim()) ? <p>{noteExcerpt(note) || '只有标题'}</p> : null}
        <div className="note-meta">
          {topic && <span className="topic-mark"><i style={{ backgroundColor: topic.color }} /><span className="topic-mark-name">{topic.name}</span></span>}
          <span>{note.wordCount.toLocaleString('zh-CN')} 字</span>
          <time dateTime={new Date(note.updatedAt).toISOString()} title={formatFullTime(note.updatedAt)}>{formatRelativeTime(note.updatedAt)}</time>
        </div>
      </button>
      <div className="note-card-actions">
        <IconButton label={note.pinned ? '取消固定' : '固定文章'} onClick={onPin}>{note.pinned ? <PinOff size={15} /> : <Pin size={15} />}</IconButton>
        <IconButton label={`删除文章：${displayTitle(note)}`} className="delete-note-button" onClick={onDelete}><Trash2 size={15} /></IconButton>
      </div>
    </motion.article>
  )
}
