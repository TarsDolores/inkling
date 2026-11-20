import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, Settings as SettingsIcon, ArrowDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getTimeGreeting } from '../lib/greeting'
import { NoteCard } from '../components/NoteCard'
import { IconButton } from '../components/IconButton'
import { StatsDashboard } from '../components/StatsDashboard'
import { TopicNotesPanel } from '../components/TopicNotesPanel'
import { HomeSidebar } from '../components/HomeSidebar'
import { ThemeToggle } from '../components/ThemeToggle'
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

export function Home() {
  const { notes, topics, topicFilter, createNote, openNote, setPinned, moveToTrash, setSearchOpen, setView, settings } = useAppStore()
  const activeNotes = useMemo(() => notes.filter((note) => !note.deletedAt && (topicFilter === 'all' || note.topicId === topicFilter)), [notes, topicFilter])
  const pinned = activeNotes.filter((note) => note.pinned)
  const recent = activeNotes.filter((note) => !note.pinned)
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]))
  const [openTopicId, setOpenTopicId] = useState<string | null>(null)
  const [greeting, setGreeting] = useState(getTimeGreeting)
  const contentRef = useRef<HTMLElement | null>(null)
  const pageLock = useRef(false)
  const aiEnabled = settings.aiEnabled !== false

  useEffect(() => {
    const timer = window.setInterval(() => setGreeting(getTimeGreeting()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const node = contentRef.current
    // 关闭 AI 后是单页自然滚动，不需要翻页手势
    if (!node || !aiEnabled) return
    const goToPage = (top: number) => {
      if (pageLock.current) return
      pageLock.current = true
      node.scrollTo({ top, behavior: 'smooth' })
      window.setTimeout(() => { pageLock.current = false }, 650)
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 1) return
      if (pageLock.current) { event.preventDefault(); return }
      const page2 = node.scrollTop >= node.clientHeight / 2
      if (!page2 && event.deltaY > 0) {
        event.preventDefault()
        goToPage(node.clientHeight)
        return
      }
      if (page2 && event.deltaY < 0) {
        const notes = node.querySelector<HTMLElement>('.notes-page-body')
        if (notes && notes.scrollTop > 0) return
        event.preventDefault()
        goToPage(0)
      }
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [aiEnabled])

  const pinnedSection = pinned.length > 0 && (
    <section className="note-section notes-page-pinned">
      <div className="section-heading"><h2>固定</h2><span>{pinned.length}</span></div>
      <div className="pinned-grid">{pinned.map((note) => <NoteCard key={note.id} note={note} topic={topicMap.get(note.topicId)} onOpen={() => openNote(note.id)} onPin={() => void setPinned(note.id, false)} onDelete={() => void moveToTrash(note.id)} />)}</div>
    </section>
  )

  const noteList = (
    <div className="note-list"><AnimatePresence initial={false}>{recent.map((note) => <NoteCard key={note.id} note={note} topic={topicMap.get(note.topicId)} onOpen={() => openNote(note.id)} onPin={() => void setPinned(note.id, true)} onDelete={() => void moveToTrash(note.id)} compact />)}</AnimatePresence></div>
  )

  const header = (
    <header className="home-header">
      <div><p className="date-line">{dateFormatter.format(new Date())}</p><h1>{topicFilter === 'all' ? greeting : topicMap.get(topicFilter)?.name}</h1></div>
      <div className="header-actions">
        <button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={18} /><span>搜索文字</span><kbd>Ctrl K</kbd></button>
        <ThemeToggle />
        <IconButton label="设置" onClick={() => setView('settings')}><SettingsIcon size={19} /></IconButton>
        <motion.button className="new-note-button" aria-label="新建文章" onClick={() => void createNote()} whileTap={{ scale: .97 }} layoutId="new-note"><Plus size={18} /><span>写一篇</span></motion.button>
      </div>
    </header>
  )

  const empty = !activeNotes.length && <motion.div className="home-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span className="empty-line" /><h2>这里还很安静</h2><button className="primary-button" onClick={() => void createNote()}><Plus size={18} />写第一篇</button></motion.div>

  return (
    <main className={`home-page${aiEnabled ? '' : ' plain-home'}`}>
      <HomeSidebar onOpenTopic={setOpenTopicId} />

      <section className="home-content" ref={contentRef}>
        {aiEnabled ? (
          <>
            <section className={`home-page-section home-dashboard-section${activeNotes.length ? '' : ' home-dashboard-empty'}`}>
              {header}
              <StatsDashboard notes={notes} />
              {empty}
              {activeNotes.length > 0 && (
                <div className="page-down-hint" aria-hidden="true"><span>下一屏</span><b>最近写下</b><ArrowDown size={13} /></div>
              )}
            </section>

            {activeNotes.length > 0 && (
              <section className="home-page-section home-notes-section">
                <div className="notes-page-heading">
                  <div><h2>最近写下</h2></div>
                  <span>{activeNotes.length}</span>
                </div>
                <div className="notes-page-body">
                  {pinnedSection}
                  {recent.length > 0 && noteList}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="home-page-section home-plain-section">
            {header}
            <StatsDashboard notes={notes} />
            {empty}
            {activeNotes.length > 0 && (
              <section className="plain-notes">
                <div className="notes-page-heading">
                  <div><h2>最近写下</h2></div>
                  <span>{activeNotes.length}</span>
                </div>
                {pinnedSection}
                {recent.length > 0 && noteList}
              </section>
            )}
          </section>
        )}
      </section>

      <TopicNotesPanel topic={topics.find((topic) => topic.id === openTopicId) ?? null} onClose={() => setOpenTopicId(null)} />
    </main>
  )
}
