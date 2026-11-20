import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { displayTitle, formatRelativeTime } from '../lib/text'
import { IconButton } from './IconButton'

export function TrashDrawer() {
  const { trashOpen, setTrashOpen, notes, restoreNote, deleteForever } = useAppStore()
  const deleted = notes.filter((note) => note.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  return <AnimatePresence>{trashOpen && <>
    <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTrashOpen(false)} />
    <motion.aside className="trash-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} role="dialog" aria-modal="true" aria-label="回收站">
      <header><div><h2>回收站</h2></div><IconButton label="关闭回收站" onClick={() => setTrashOpen(false)}><X size={19} /></IconButton></header>
      <p className="drawer-note">这里的文章仍保存在本机，直到你永久删除。</p>
      <div className="trash-list">{deleted.map((note) => <article key={note.id}><div><strong>{displayTitle(note)}</strong><time>{formatRelativeTime(note.deletedAt!)}</time></div><div><IconButton label="恢复文章" onClick={() => void restoreNote(note.id)}><RotateCcw size={17} /></IconButton><IconButton label="永久删除" onClick={() => { if (confirm('永久删除后无法恢复。确定继续吗？')) void deleteForever(note.id) }}><Trash2 size={17} /></IconButton></div></article>)}</div>
      {!deleted.length && <div className="drawer-empty"><Trash2 size={25} /><p>回收站是空的</p></div>}
    </motion.aside>
  </>}</AnimatePresence>
}
