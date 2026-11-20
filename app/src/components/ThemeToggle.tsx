import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

export function ThemeToggle() {
  const { settings, updateSettings, showToast } = useAppStore()
  const [systemDark, setSystemDark] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  const toggle = async () => {
    setSaving(true)
    try {
      await updateSettings({ theme: dark ? 'light' : 'dark' })
    } catch {
      showToast('夜间模式切换失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button type="button" className="icon-button theme-toggle" role="switch" aria-label="夜间模式"
      aria-checked={dark} disabled={saving}
      onClick={() => void toggle()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 6a6 6 0 0 0 0 12Z" fill="currentColor" />
      </svg>
    </button>
  )
}
