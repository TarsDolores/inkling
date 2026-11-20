import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Download, RotateCw } from 'lucide-react'
import { getBackups, getBackupText } from '../data/sync'
import { download } from '../lib/export'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  backupBusy: boolean
  backupMessage: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, backupBusy: false, backupMessage: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('随记界面错误', error, info.componentStack)
  }

  downloadLatest = async () => {
    this.setState({ backupBusy: true, backupMessage: '' })
    try {
      const backups = await getBackups()
      if (!backups.length) {
        this.setState({ backupMessage: '还没有可下载的备份，请先重新打开随记。' })
        return
      }
      const text = await getBackupText(backups[0].name)
      download(text, 'application/json;charset=utf-8', backups[0].name)
      this.setState({ backupMessage: '最近一份备份已开始下载。' })
    } catch (error) {
      this.setState({ backupMessage: error instanceof Error ? error.message : '下载备份失败' })
    } finally {
      this.setState({ backupBusy: false })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="error-screen boundary-screen">
        <span>随记遇到一个界面问题</span>
        <p>{this.state.error.message || '页面没有正常显示'}</p>
        <div className="boundary-actions">
          <button onClick={() => location.reload()}><RotateCw size={16} />重新载入</button>
          <button disabled={this.state.backupBusy} onClick={() => void this.downloadLatest()}><Download size={16} />{this.state.backupBusy ? '正在读取…' : '下载最近备份'}</button>
        </div>
        <p className="boundary-note">文章仍保存在 sync-data 文件夹中。可以先下载最近备份，再重新打开随记。</p>
        {this.state.backupMessage && <p className="boundary-note" role="status">{this.state.backupMessage}</p>}
      </main>
    )
  }
}
