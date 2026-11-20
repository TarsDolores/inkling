import { useMemo } from 'react'
import { Archive, Plus, Settings } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

interface Props {
  onOpenTopic: (topicId: string) => void
}

export function HomeSidebar({ onOpenTopic }: Props) {
  const { notes, topics, topicFilter, setFilter, setTrashOpen, setView, createNote, space, switching, switchSpace, settings } = useAppStore()
  const activeNotes = useMemo(() => notes.filter((note) => !note.deletedAt), [notes])
  const topicCounts = useMemo(() => new Map(topics.map((topic) => [topic.id, activeNotes.filter((note) => note.topicId === topic.id).length])), [activeNotes, topics])
  const spaces = settings.spaces
  const activeIndex = Math.max(0, spaces.findIndex((item) => item.id === space))

  return <aside className="sidebar">
    <div className="brand"><span className="brand-glyph">随</span><span>随记</span></div>
    <div className={`space-switch${switching ? ' switching' : ''}`} role="group" aria-label="切换空间" style={{ ['--space-count' as string]: String(spaces.length) }}>
      <span className="space-switch-indicator" aria-hidden="true" style={{ left: `calc(3px + (100% - 6px) * ${activeIndex} / ${spaces.length})`, width: `calc((100% - 6px) / ${spaces.length})` }} />
      {spaces.map((item) => (
        <button key={item.id} type="button" className={space === item.id ? 'active' : ''} aria-pressed={space === item.id} disabled={switching} onClick={() => void switchSpace(item.id)}>{item.name}</button>
      ))}
    </div>
    <button className="sidebar-compose" onClick={() => void createNote()}><Plus size={15} />写一篇</button>
    <nav aria-label="主题">
      <button className={topicFilter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>全部文章</span><small>{activeNotes.length}</small></button>
      <div className="nav-label">主题</div>
      {topics.map((topic) => <button key={topic.id} className={topicFilter === topic.id ? 'active' : ''} onClick={() => { setFilter(topic.id); onOpenTopic(topic.id) }}><span><i style={{ backgroundColor: topic.color }} /><span className="sidebar-topic-name">{topic.name}</span></span><small>{topicCounts.get(topic.id) ?? 0}</small></button>)}
      <button className="add-topic-shortcut" onClick={() => { setView('settings'); window.setTimeout(() => document.getElementById('new-topic-name')?.focus(), 350) }}><span><Plus size={14} />新建主题</span></button>
    </nav>
    <div className="sidebar-footer">
      <div className="sidebar-sync"><i aria-hidden="true" /><span>本地优先</span><span className="sync-separator">·</span><span className="sync-service">本地存储</span></div>
      <div className="sidebar-footer-actions">
        <button type="button" onClick={() => setTrashOpen(true)} title="回收站"><Archive size={15} /><span>回收站</span></button>
        <button type="button" onClick={() => setView('settings')} title="设置"><Settings size={15} /><span>设置</span></button>
      </div>
    </div>
  </aside>
}
