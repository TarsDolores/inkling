import { useCallback, useEffect, useState } from 'react'
import { Database, Download, History, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { createBackup, getBackupText, getBackups, type BackupInfo } from '../data/sync'
import { download } from '../lib/export'
import { useAppStore } from '../store/useAppStore'
import { IconButton } from './IconButton'

const reasonLabels: Record<string, string> = {
  daily: '每日自动',
  manual: '手动',
  'before-restore': '恢复前',
  'before-import': '导入前'
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

function describe(backup: BackupInfo) {
  return reasonLabels[backup.reason] ?? '自动'
}

export function BackupPanel() {
  const { restoreFromBackup, showToast } = useAppStore()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setBackups(await getBackups()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取备份列表') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const backupNow = async () => {
    setBusy('backup')
    try {
      const backup = await createBackup('manual')
      showToast(`备份已创建：${backup.name}`)
      await load()
    } catch (reason) {
      showToast(reason instanceof Error ? `备份失败：${reason.message}` : '备份失败')
    } finally {
      setBusy(null)
    }
  }

  const downloadBackup = async (backup: BackupInfo) => {
    try {
      download(await getBackupText(backup.name), 'application/json;charset=utf-8', backup.name)
    } catch (reason) {
      showToast(reason instanceof Error ? `下载失败：${reason.message}` : '下载备份失败')
    }
  }

  const restore = async (backup: BackupInfo) => {
    const when = dateFormatter.format(new Date(backup.modifiedAt))
    if (!window.confirm(`从 ${when} 的${describe(backup)}备份恢复？\n\n备份中的同名文章会覆盖当前版本；备份时存在的文章会恢复，回收站里的仍留在回收站；备份之后新写的文章会保留。恢复前会自动再创建一份当前数据的安全备份。`)) return
    setBusy('restore')
    const restored = await restoreFromBackup(backup.name)
    if (restored) await load()
    setBusy(null)
  }

  const latest = backups[0]

  return (
    <div className="backup-panel">
      <div className="backup-summary">
        <div>
          <span>最近一次备份</span>
          <strong>{latest ? dateFormatter.format(new Date(latest.modifiedAt)) : '尚未创建'}</strong>
          <small>{latest ? `${backups.length} 份备份，保留最近 45 天` : '打开随记后会自动创建第一份备份'}</small>
        </div>
        <div className="backup-buttons">
          <button className="backup-now" disabled={busy !== null || loading} onClick={() => void backupNow()}>
            <Database size={16} />{busy === 'backup' ? '正在备份…' : '立即备份'}
          </button>
          <IconButton label="刷新备份列表" disabled={loading || busy !== null} onClick={() => void load()}>
            <RefreshCw size={16} className={loading ? 'backup-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {error && <p className="backup-error" role="status">{error}</p>}

      <div className="backup-list">
        {loading && !backups.length && <div className="backup-empty"><LoaderCircle size={18} className="backup-spin" />正在读取备份…</div>}
        {!loading && !backups.length && !error && <div className="backup-empty"><ShieldCheck size={20} />还没有备份，稍后会自动创建。</div>}
        {backups.slice(0, 8).map((backup) => (
          <article className="backup-item" key={backup.name}>
            <div className="backup-item-copy">
              <strong>{describe(backup)}备份 · {formatSize(backup.size)}</strong>
              <small>{dateFormatter.format(new Date(backup.modifiedAt))} · {backup.name}</small>
            </div>
            <div className="backup-item-actions">
              <button disabled={busy !== null} onClick={() => void downloadBackup(backup)}><Download size={14} />下载</button>
              <button disabled={busy !== null} onClick={() => void restore(backup)}><History size={14} />{busy === 'restore' ? '恢复中…' : '恢复'}</button>
            </div>
          </article>
        ))}
      </div>
      {backups.length > 8 && <p className="backup-note">仅显示最近 8 份；更早的文件仍保存在 sync-data/backups 中。</p>}
      <p className="backup-note">恢复采用合并方式，不会清空备份之后新写的文章。</p>
    </div>
  )
}
