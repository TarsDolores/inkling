import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function Toast() {
  const { toast, showToast, notes, restoreNote } = useAppStore()
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => showToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast, showToast])
  const deleted = notes.filter((note) => note.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))[0]
  return <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 18, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 12, x: '-50%' }}><span>{toast}</span>{toast.includes('回收站') && deleted && <button onClick={() => { void restoreNote(deleted.id); showToast(null) }}><RotateCcw size={14} />撤销</button>}</motion.div>}</AnimatePresence>
}
