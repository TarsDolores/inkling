import { useEffect, useRef, useState } from 'react'
import { Check, Copy, KeyRound, LoaderCircle } from 'lucide-react'
import { getAiConfig, saveAiConfig, type AiConfigStatus } from '../data/sync'
import { useAppStore } from '../store/useAppStore'

export function AiConnectionSettings() {
  const showToast = useAppStore((state) => state.showToast)
  const [config, setConfig] = useState<AiConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState('')
  const [endpoint, setEndpoint] = useState('https://opencode.ai/inference/go/openai/v1/chat/completions')
  const [model, setModel] = useState('deepseek-v4.1-flash')
  const [maxTokens, setMaxTokens] = useState('32000')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    void getAiConfig()
      .then((next) => {
        if (!mounted.current) return
        setConfig(next)
        setEndpoint(next.endpoint)
        setModel(next.model)
        setMaxTokens(String(next.maxTokens))
      })
      .catch((reason) => {
        if (mounted.current) setError(reason instanceof Error ? reason.message : '无法读取本机 AI 配置')
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })
    return () => { mounted.current = false }
  }, [])

  const save = async () => {
    if (saving) return
    const tokens = Number(maxTokens)
    if (!Number.isFinite(tokens) || tokens < 300 || tokens > 384000) {
      setError('最大输出需要在 300 到 384000 之间')
      return
    }
    setSaving(true)
    setError('')
    try {
      const next = await saveAiConfig({
        apiKey: key.trim(),
        endpoint: endpoint.trim(),
        model: model.trim(),
        maxTokens: tokens
      })
      setConfig(next)
      setKey('')
      showToast(next.configured ? 'AI Key 已保存到本机' : '已保存设置，但还没有可用的 Key')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存 AI 设置失败')
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const copyPath = async () => {
    if (!config?.path) return
    try {
      await navigator.clipboard.writeText(config.path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      showToast('无法复制配置文件路径')
    }
  }

  return (
    <div className="ai-connection-settings">
      {loading ? (
        <p className="settings-state"><LoaderCircle size={14} className="ai-spin" />正在读取本机配置…</p>
      ) : (
        <>
          <div className="ai-connection-fields">
            <label className="settings-field full">
              <span>API Key</span>
              <input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder={config?.configured ? '已配置；留空表示不修改' : '粘贴 OpenCode Go API Key'} />
            </label>
            <label className="settings-field full">
              <span>Endpoint</span>
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} />
            </label>
            <label className="settings-field">
              <span>Model</span>
              <input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} />
            </label>
            <label className="settings-field">
              <span>最大输出</span>
              <input type="number" min={300} max={384000} step={1000} value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} />
            </label>
            <div className="settings-field">
              <span>状态</span>
              <p className={`ai-connection-state${config?.configured ? ' ready' : ''}`}>{config?.configured ? <><Check size={13} />本机可用</> : <><KeyRound size={13} />等待 Key</>}</p>
            </div>
          </div>
          <p className="settings-note">Key 只保存在这台电脑的 LocalAppData，不会写进浏览器，也不会进入同步或备份文件。</p>
          {config?.path && <p className="settings-path"><span>配置文件</span><code>{config.path}</code><button type="button" onClick={() => void copyPath()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button></p>}
          {config?.keySource === 'environment' && <p className="settings-note">当前使用环境变量 OPENCODE_GO_API_KEY；在这里保存会优先使用本机配置。</p>}
          {error && <p className="settings-error">{error}</p>}
          <div className="settings-actions"><button type="button" className="settings-save" disabled={saving} onClick={() => void save()}>{saving && <LoaderCircle size={14} className="ai-spin" />}{saving ? '保存中…' : '保存到本机'}</button></div>
        </>
      )}
    </div>
  )
}
