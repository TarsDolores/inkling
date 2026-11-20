import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Database, Download, Moon, Plus, Sun, Trash2, Upload } from 'lucide-react'
import { DEFAULT_SETTINGS } from '../data/db'
import { createBackup, getBackupText, getSystemFonts } from '../data/sync'
import { download, parseBackup } from '../lib/export'
import { FONT_FALLBACKS, fontStack } from '../lib/fonts'
import { DEFAULT_AI_PERSONA } from '../lib/aiPersona'
import { AI_MODES, AI_RANGES, ECHO_SIZES } from '../lib/aiOptions'
import { useAppStore } from '../store/useAppStore'
import { AiConnectionSettings } from '../components/AiConnectionSettings'
import { BackupPanel } from '../components/BackupPanel'
import { IconButton } from '../components/IconButton'

const COLORS = ['#708b82', '#718397', '#9a846c', '#8a7f91', '#8d766d', '#6f898b']

type FontField = 'fontDisplay' | 'fontUi' | 'fontMono' | 'fontWriting'

const ADDED_FONTS = [
  'LXGW WenKai Local'
]

const FONT_RECOMMENDATIONS: Record<FontField, string[]> = {
  fontDisplay: ['Noto Serif SC', 'LXGW WenKai Local', 'SimSun', 'Georgia', 'Songti SC', 'Times New Roman'],
  fontUi: ['Noto Sans SC', 'Microsoft YaHei UI', 'Segoe UI', 'Arial', 'Microsoft YaHei'],
  fontMono: ['Cascadia Mono', 'Consolas', 'JetBrains Mono', 'Courier New', 'Noto Sans SC'],
  fontWriting: ['Noto Serif SC', 'Noto Sans SC', 'SimSun', 'Microsoft YaHei UI', 'KaiTi']
}

const SECTIONS = [
  { id: 'appearance', label: '外观' },
  { id: 'spaces', label: '空间' },
  { id: 'fonts', label: '字体' },
  { id: 'reading', label: '阅读' },
  { id: 'display', label: '显示' },
  { id: 'ai', label: 'AI' },
  { id: 'topics', label: '主题' },
  { id: 'data', label: '数据' }
]

export function Settings() {
  const store = useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [newTopic, setNewTopic] = useState('')
  const [newTopicColor, setNewTopicColor] = useState(COLORS[0])
  const [message, setMessage] = useState('')
  const [fontFamilies, setFontFamilies] = useState<string[]>([])
  const [fontsLoading, setFontsLoading] = useState(true)
  const [fontsError, setFontsError] = useState('')
  const [showAllFonts, setShowAllFonts] = useState(() => {
    try { return localStorage.getItem('suiji-show-all-fonts') === '1' } catch { return false }
  })
  const [personaDraft, setPersonaDraft] = useState('')
  const [personaSaved, setPersonaSaved] = useState(false)
  const [activeSection, setActiveSection] = useState('appearance')

  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.settings-page')
    if (!page) return
    const sections = Array.from(page.querySelectorAll<HTMLElement>('.settings-section[id]'))
    if (!sections.length) return
    const updateActive = () => {
      let current = sections[0].id
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 108) current = section.id
      }
      setActiveSection(current)
    }
    page.addEventListener('scroll', updateActive, { passive: true })
    updateActive()
    return () => page.removeEventListener('scroll', updateActive)
  }, [])

  const goToSection = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    setPersonaDraft(store.settings.aiPersona || DEFAULT_AI_PERSONA)
  }, [store.settings.aiPersona])

  const savePersona = async () => {
    const value = personaDraft.trim().slice(0, 800) || DEFAULT_AI_PERSONA
    await store.updateSettings({ aiPersona: value })
    setPersonaDraft(value)
    setPersonaSaved(true)
  }

  useEffect(() => {
    let active = true
    void getSystemFonts()
      .then((fonts) => { if (active) setFontFamilies(fonts) })
      .catch((error) => { if (active) setFontsError(error instanceof Error ? error.message : '无法读取本机字体') })
      .finally(() => { if (active) setFontsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('suiji-show-all-fonts', showAllFonts ? '1' : '0') } catch { /* Preference is optional. */ }
  }, [showAllFonts])

  const allFonts = (field: FontField) => {
    const priority = (name: string) => {
      const added = ADDED_FONTS.findIndex((item) => item.toLowerCase() === name.toLowerCase())
      if (added >= 0) return added
      const recommended = FONT_RECOMMENDATIONS[field].findIndex((item) => item.toLowerCase() === name.toLowerCase())
      if (recommended >= 0) return 100 + recommended
      return 1000
    }
    return [...fontFamilies].sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, 'zh-CN'))
  }

  const fontChoices = (field: FontField, selected: string) => {
    const find = (name: string) => fontFamilies.find((font) => font.toLowerCase() === name.toLowerCase())
    const picked: string[] = []
    for (const name of FONT_RECOMMENDATIONS[field]) {
      const font = find(name)
      if (font && !picked.includes(font)) picked.push(font)
      if (picked.length >= 4) break
    }
    if (picked.length < 4) {
      for (const font of allFonts(field)) {
        if (!picked.includes(font)) picked.push(font)
        if (picked.length >= 4) break
      }
    }
    if (showAllFonts) {
      const result = allFonts(field)
      if (selected && !result.some((font) => font.toLowerCase() === selected.toLowerCase())) result.push(selected)
      return result
    }
    if (selected && !picked.some((font) => font.toLowerCase() === selected.toLowerCase())) picked.push(selected)
    return picked
  }
  const previewFamily = (name: string, fallback: string) => name ? fontStack(name, fallback) : fallback

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      await store.importBackup(backup)
      setMessage(`已安全合并 ${backup.spaces ? Object.values(backup.spaces).reduce((total, part) => total + (part?.notes.length ?? 0), 0) : backup.notes?.length ?? 0} 篇文章。现有数据没有被清空。`)
    } catch (error) {
      setMessage(error instanceof Error ? `导入失败：${error.message}` : '导入失败：文件无效')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const exportAllBackup = async () => {
    setMessage('正在导出完整备份…')
    try {
      const backup = await createBackup('manual')
      const text = await getBackupText(backup.name)
      download(text, 'application/json;charset=utf-8', backup.name)
      setMessage('完整备份已导出。')
    } catch (error) {
      setMessage(error instanceof Error ? `导出失败：${error.message}` : '导出失败')
    }
  }

  const addTopic = async () => {
    const name = newTopic.trim()
    if (!name) return
    await store.addTopic(name, newTopicColor)
    setNewTopic('')
    setNewTopicColor(COLORS[(store.topics.length + 1) % COLORS.length])
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <IconButton label="返回首页" onClick={store.goHome}><ArrowLeft size={20} /></IconButton>
        <div className="settings-title"><h1>设置</h1></div>
        <button type="button" className="settings-reset" onClick={() => void store.updateSettings(DEFAULT_SETTINGS)}>恢复默认</button>
      </header>
      <div className="settings-shell">
        <nav className="settings-index" aria-label="设置分区">
          {SECTIONS.map((section) => (
            <button key={section.id} type="button" className={activeSection === section.id ? 'active' : ''} aria-current={activeSection === section.id ? 'true' : undefined} onClick={() => goToSection(section.id)}>{section.label}</button>
          ))}
        </nav>
        <div className="settings-content">
          <section className="settings-section settings-card" id="appearance">
            <div className="setting-copy"><h2>外观</h2></div>
            <div className="setting-control">
              <div className="theme-options">{(['light', 'dark', 'system'] as const).map((mode) => <button key={mode} className={store.settings.theme === mode ? 'selected' : ''} aria-pressed={store.settings.theme === mode} onClick={() => void store.updateSettings({ theme: mode })}>{mode === 'light' ? <Sun size={18} /> : mode === 'dark' ? <Moon size={18} /> : <span className="system-icon">A</span>}<span>{mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统'}</span>{store.settings.theme === mode && <Check size={14} />}</button>)}</div>
              <div className="settings-row"><span>动效</span><div className="segmented">{(['full', 'reduced', 'off'] as const).map((level) => <button key={level} className={store.settings.motion === level ? 'selected' : ''} aria-pressed={store.settings.motion === level} onClick={() => void store.updateSettings({ motion: level })}>{level === 'full' ? '完整' : level === 'reduced' ? '轻微' : '关闭'}</button>)}</div></div>
            </div>
          </section>

          <section className="settings-section settings-card" id="spaces">
            <div className="setting-copy"><h2>空间</h2></div>
            <div className="setting-control spaces-settings">
              {store.settings.spaces.map((item) => (
                <div className="space-setting" key={item.id}>
                  <input
                    defaultValue={item.name}
                    maxLength={10}
                    aria-label={`${item.id} 空间名称`}
                    onBlur={(event) => {
                      const name = event.target.value.replace(/\s+/g, ' ').trim().slice(0, 10)
                      if (!name || name === item.name) { event.target.value = item.name; return }
                      void store.updateSettings({ spaces: store.settings.spaces.map((config) => config.id === item.id ? { ...config, name } : config) })
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  />
                  <code className="space-id">{item.id}</code>
                  {store.space === item.id && <span className="space-current">当前</span>}
                  {store.settings.spaces.length > 1 && (
                    <IconButton label={`隐藏「${item.name}」`} onClick={() => {
                      const remaining = store.settings.spaces.filter((config) => config.id !== item.id)
                      void store.updateSettings({ spaces: remaining }).then(() => {
                        if (store.space === item.id && remaining.length) void store.switchSpace(remaining[0].id)
                      })
                    }}><Trash2 size={15} /></IconButton>
                  )}
                </div>
              ))}
              {store.settings.spaces.length < 3 && (
                <button type="button" className="space-add" onClick={() => {
                  const existing = new Set(store.settings.spaces.map((item) => item.id))
                  let index = store.settings.spaces.length + 1
                  let id = `space-${index}`
                  while (existing.has(id)) { index += 1; id = `space-${index}` }
                  void store.updateSettings({ spaces: [...store.settings.spaces, { id, name: `空间${index}` }] })
                }}><Plus size={15} />添加空间</button>
              )}
              <p className="settings-note">隐藏空间不会删除文章，数据仍保留在 sync-data/spaces 对应目录里，随时可以重新添加。</p>
            </div>
          </section>

          <section className="settings-section settings-card font-section" id="fonts">
            <div className="setting-copy"><h2>字体</h2></div>
            <div className="setting-control font-settings">
              <label className="font-toggle-row"><input type="checkbox" checked={showAllFonts} onChange={(event) => setShowAllFonts(event.target.checked)} /><span>{showAllFonts ? `已显示全部 ${fontFamilies.length} 个字体` : '显示全部字体'}</span></label>
              <label className="font-field"><span>标题 / 展示</span><select value={store.settings.fontDisplay ?? ''} onChange={(event) => void store.updateSettings({ fontDisplay: event.target.value })}><option value="">随记默认 · 衬线标题栈 + 中文回退</option>{fontChoices('fontDisplay', store.settings.fontDisplay).map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <label className="font-field"><span>界面 / 正文</span><select value={store.settings.fontUi ?? ''} onChange={(event) => void store.updateSettings({ fontUi: event.target.value })}><option value="">随记默认 · 无衬线界面栈 + 中文回退</option>{fontChoices('fontUi', store.settings.fontUi).map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <label className="font-field"><span>等宽 / 元数据</span><select value={store.settings.fontMono ?? ''} onChange={(event) => void store.updateSettings({ fontMono: event.target.value })}><option value="">随记默认 · 等宽栈 + 中文回退</option>{fontChoices('fontMono', store.settings.fontMono).map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <label className="font-field"><span>写作正文</span><select value={store.settings.fontWriting ?? ''} onChange={(event) => void store.updateSettings({ fontWriting: event.target.value })}><option value="">随记默认 · 霞鹜文楷</option>{fontChoices('fontWriting', store.settings.fontWriting).map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              {fontsLoading && <p className="font-state">正在读取本机字体…</p>}
              {fontsError && <p className="font-state font-error">读取字体列表失败：{fontsError}。仍可使用默认字体。</p>}
              <div className="font-preview" aria-hidden="true">
                <div><span>标题</span><strong style={{ fontFamily: previewFamily(store.settings.fontDisplay, FONT_FALLBACKS.display) }}>今天，写点什么？</strong></div>
                <div><span>正文</span><p style={{ fontFamily: previewFamily(store.settings.fontUi, FONT_FALLBACKS.ui) }}>雨停之后，桌子还是那张桌子，但光不一样了。</p></div>
                <div><span>元数据</span><p style={{ fontFamily: previewFamily(store.settings.fontMono, FONT_FALLBACKS.mono) }}>最近 30 天 · 10月24日 · 21 篇</p></div>
                <div><span>写作</span><p style={{ fontFamily: previewFamily(store.settings.fontWriting, FONT_FALLBACKS.writing) }}>今天下雨了。我在旧桌子前坐了很久。</p></div>
              </div>
            </div>
          </section>

          <section className="settings-section settings-card" id="reading">
            <div className="setting-copy"><h2>阅读</h2></div>
            <div className="setting-control range-stack">
              <label><span>正文字号 <b>{store.settings.fontSize}px</b></span><input type="range" min="15" max="23" step="1" value={store.settings.fontSize} onChange={(event) => void store.updateSettings({ fontSize: Number(event.target.value) })} /></label>
              <label><span>界面字号 <b>{store.settings.interfaceFontSize}px</b></span><input type="range" min="11" max="17" step="1" value={store.settings.interfaceFontSize} onChange={(event) => void store.updateSettings({ interfaceFontSize: Number(event.target.value) })} /></label>
              <label><span>正文行高 <b>{store.settings.lineHeight.toFixed(1)}</b></span><input type="range" min="1.5" max="2.2" step="0.1" value={store.settings.lineHeight} onChange={(event) => void store.updateSettings({ lineHeight: Number(event.target.value) })} /></label>
              <label className="switch-row" title="输入时让当前行停留在正文中部"><span><strong>光标居中</strong></span><input type="checkbox" checked={store.settings.typewriterMode} onChange={(event) => void store.updateSettings({ typewriterMode: event.target.checked })} /></label>
            </div>
          </section>

          <section className="settings-section settings-card" id="display">
            <div className="setting-copy"><h2>显示</h2></div>
            <div className="setting-control display-settings">
              <label className="switch-row"><span><strong>30 天写作热力条</strong></span><input type="checkbox" checked={store.settings.showHeatmap} onChange={(event) => void store.updateSettings({ showHeatmap: event.target.checked })} /></label>
              <label className="switch-row"><span><strong>回声关键词</strong></span><input type="checkbox" checked={store.settings.showEchoKeywords} onChange={(event) => void store.updateSettings({ showEchoKeywords: event.target.checked })} /></label>
              <div className="settings-row"><span>回声字号</span><div className="segmented">{ECHO_SIZES.map((size) => <button key={size.id} className={store.settings.echoSize === size.id ? 'selected' : ''} aria-pressed={store.settings.echoSize === size.id} onClick={() => void store.updateSettings({ echoSize: size.id })}>{size.label}</button>)}</div></div>
            </div>
          </section>

          <section className="settings-section settings-card ai-settings-section" id="ai">
            <div className="setting-copy"><h2>AI 回声</h2></div>
            <div className="setting-control ai-settings-stack">
              <div className="settings-subsection">
                <h3>生成偏好</h3>
                <div className="settings-field-grid">
                  <label className="settings-field"><span>默认范围</span><select value={store.settings.aiDefaultRange} onChange={(event) => void store.updateSettings({ aiDefaultRange: event.target.value as typeof store.settings.aiDefaultRange })}>{AI_RANGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  <label className="settings-field"><span>默认读取</span><select value={store.settings.aiDefaultMode} onChange={(event) => void store.updateSettings({ aiDefaultMode: event.target.value as typeof store.settings.aiDefaultMode })}>{AI_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                </div>
              </div>
              <div className="settings-subsection">
                <h3>本机连接</h3>
                <AiConnectionSettings />
              </div>
              <div className="settings-subsection">
                <h3>人设</h3>
                <div className="persona-control">
                  <textarea id="ai-persona" value={personaDraft} maxLength={800} rows={5} onChange={(event) => { setPersonaDraft(event.target.value); setPersonaSaved(false) }} />
                  <div className="persona-meta"><span>{personaDraft.length} / 800</span>{personaSaved && <span className="persona-saved">已保存</span>}</div>
                  <div className="persona-actions">
                    <button type="button" className="terminal-button" onClick={() => { setPersonaDraft(DEFAULT_AI_PERSONA); setPersonaSaved(false) }}>恢复默认</button>
                    <button type="button" className="terminal-button primary" onClick={() => void savePersona()}>保存人设</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section settings-card topics-setting" id="topics">
            <div className="setting-copy"><h2>主题</h2></div>
            <div className="setting-control topic-settings-list">
              {store.topics.map((topic) => <div className="topic-setting" key={topic.id}><input type="color" value={topic.color} aria-label={`${topic.name}颜色`} onChange={(event) => void store.updateTopic(topic.id, { color: event.target.value })} /><input value={topic.name} aria-label="主题名称" onChange={(event) => void store.updateTopic(topic.id, { name: event.target.value })} />{!topic.builtIn && <IconButton label="删除主题" onClick={() => { if (confirm(`删除“${topic.name}”？其中的文章会移到“闪念”。`)) void store.deleteTopic(topic.id) }}><Trash2 size={16} /></IconButton>}</div>)}
              <div className="add-topic"><input type="color" value={newTopicColor} aria-label="新主题颜色" onChange={(event) => setNewTopicColor(event.target.value)} /><input id="new-topic-name" value={newTopic} onChange={(event) => setNewTopic(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addTopic() }} placeholder="输入新主题名称" /><button onClick={() => void addTopic()}><Plus size={16} />创建</button></div>
            </div>
          </section>

          <section className="settings-section settings-card data-section" id="data">
            <div className="setting-copy"><h2>数据</h2></div>
            <div className="setting-control data-actions">
              <button onClick={() => void exportAllBackup()}><Download size={17} /><span><strong>导出完整备份</strong></span></button>
              <button onClick={() => fileRef.current?.click()}><Upload size={17} /><span><strong>从备份导入</strong><small>安全合并，不会清空现有数据</small></span></button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
              {message && <p className="import-message" role="status">{message}</p>}
              <div className="storage-note"><Database size={17} /><span>数据保存在本机，建议定期导出备份。</span></div>
              <div className="settings-subsection"><h3>自动备份</h3><BackupPanel /></div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
