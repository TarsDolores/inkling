import { useEffect, useMemo } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Home } from './pages/Home'
import { Editor } from './pages/Editor'
import { Settings } from './pages/Settings'
import { SearchPalette } from './components/SearchPalette'
import { TrashDrawer } from './components/TrashDrawer'
import { Toast } from './components/Toast'
import { useAppStore } from './store/useAppStore'
import { FONT_FALLBACKS, fontStack } from './lib/fonts'

export default function App() {
  const { initialize, refreshFromDisk, ready, error, view, settings, createNote, setSearchOpen, goHome } = useAppStore()

  useEffect(() => { void initialize() }, [initialize])

  useEffect(() => {
    if (!ready || error) return
    const refresh = () => { if (document.visibilityState === 'visible') void refreshFromDisk() }
    const timer = window.setInterval(refresh, 4000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [ready, error, refreshFromDisk])

  useEffect(() => {
    if (!ready || error) return
    const applyTheme = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1916' : '#f5f0e6')
      try { localStorage.setItem('quiet-note-theme', settings.theme) } catch { /* Theme caching is optional. */ }
    }
    applyTheme()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [settings.theme, ready, error])

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
    const uiScale = settings.interfaceFontSize / 13
    for (const size of [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 23, 24, 26, 27, 28, 30, 38, 42]) {
      const scaled = size * uiScale
      const readable = size <= 10 ? Math.max(10, scaled) : scaled
      document.documentElement.style.setProperty(`--ui-${size}`, `${Math.round(readable * 100) / 100}px`)
    }
    document.documentElement.style.setProperty('--editor-line-height', String(settings.lineHeight))
    document.documentElement.dataset.motion = settings.motion
    const fontSettings = [
      ['--font-display', settings.fontDisplay, FONT_FALLBACKS.display],
      ['--font-ui', settings.fontUi, FONT_FALLBACKS.ui],
      ['--font-mono', settings.fontMono, FONT_FALLBACKS.mono],
      ['--font-writing', settings.fontWriting, FONT_FALLBACKS.writing]
    ] as const
    for (const [property, name, fallback] of fontSettings) {
      if (name) document.documentElement.style.setProperty(property, fontStack(name, fallback))
      else document.documentElement.style.removeProperty(property)
    }
  }, [settings])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const state = useAppStore.getState()
        if (state.searchOpen) state.setSearchOpen(false)
        else if (state.trashOpen) state.setTrashOpen(false)
        else goHome()
        return
      }
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); void createNote() }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [createNote, setSearchOpen, goHome])

  const transition = useMemo(() => settings.motion === 'off' ? { duration: 0 } : settings.motion === 'reduced' ? { duration: 0.14 } : { type: 'spring' as const, stiffness: 310, damping: 32 }, [settings.motion])

  if (!ready) return <div className="loading-screen"><span className="loading-mark">随</span><p>正在打开你的文字…</p></div>
  if (error) return <main className="error-screen"><span>本地数据没有正常打开</span><p>{error}</p><button onClick={() => location.reload()}>重新尝试</button></main>

  return (
    <MotionConfig transition={transition} reducedMotion={settings.motion === 'off' ? 'always' : 'user'}>
      <div className="app-shell">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'home' && <motion.div key="home" className="view-layer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .985 }}><Home /></motion.div>}
          {view === 'editor' && <motion.div key="editor" className="view-layer" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: 8 }}><Editor /></motion.div>}
          {view === 'settings' && <motion.div key="settings" className="view-layer" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}><Settings /></motion.div>}
        </AnimatePresence>
        <SearchPalette />
        <TrashDrawer />
        <Toast />
      </div>
    </MotionConfig>
  )
}
