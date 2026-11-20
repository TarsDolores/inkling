import { useState } from 'react'
import { LoaderCircle, Share } from 'lucide-react'
import type { Note } from '../types'
import { calculateWritingStats } from '../lib/stats'
import { exportStatsShareImage } from '../lib/share'
import { useAppStore } from '../store/useAppStore'
import { IconButton } from './IconButton'
import { AiReviewCard } from './AiReviewCard'
import { WritingPulse } from './WritingPulse'

function durationParts(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  if (total === 0) return { hours: 0, minutes: 0, lessThanMinute: false }
  if (total < 60) return { hours: 0, minutes: 0, lessThanMinute: true }
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), lessThanMinute: false }
}

export function StatsDashboard({ notes }: { notes: Note[] }) {
  const [sharing, setSharing] = useState(false)
  const showToast = useAppStore(state => state.showToast)
  const showHeatmap = useAppStore(state => state.settings.showHeatmap)
  const stats = calculateWritingStats(notes)
  const focus = durationParts(stats.totalWritingSeconds)

  const share = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const now = new Date()
      await exportStatsShareImage(calculateWritingStats(notes, now), now)
      showToast('分享图已生成')
    } catch {
      showToast('分享图生成失败，请重试')
    } finally {
      setSharing(false)
    }
  }

  return (
    <section className="stats-dashboard" aria-label="写作数据">
      <div className="stats-panel recap-panel">
        <div className="recap-metrics">
          <article><span>累计字数</span><strong>{stats.totalWords.toLocaleString('zh-CN')}<small>字</small></strong></article>
          <article><span>累计专注</span><strong className="metric-duration">{focus.lessThanMinute ? <>&lt;1<small>分钟</small></> : focus.hours > 0 ? <>{focus.hours}<small>小时</small>{focus.minutes > 0 && <>{focus.minutes}<small>分钟</small></>}</> : <>{focus.minutes}<small>分钟</small></>}</strong></article>
          <article><span>当前连续</span><strong>{stats.currentDailyStreak}<small>天</small></strong></article>
          <article><span>今年写下</span><strong>{stats.notesThisYear}<small>篇</small></strong></article>
          <article><span>今日记录</span><strong>{stats.todayNotes}<small>篇</small></strong></article>
        </div>
        <div className={`recap-footer-row${showHeatmap ? '' : ' heatmap-hidden'}`}>
          {showHeatmap && <WritingPulse />}
          <IconButton className="stats-share-button stats-share-compact" type="button" label={sharing ? '正在生成分享图' : '下载写作分享图'} disabled={sharing} aria-busy={sharing} onClick={() => void share()}>{sharing ? <LoaderCircle size={15} className="stats-share-spinner" /> : <Share size={15} />}</IconButton>
        </div>
        <AiReviewCard />
      </div>
    </section>
  )
}
