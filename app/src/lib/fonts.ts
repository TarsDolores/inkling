export const FONT_FALLBACKS = {
  display: '"Anthropic Serif Web Text", "Noto Sans SC", "Source Han Sans SC", Georgia, "Times New Roman", "Songti SC", serif',
  ui: '"Anthropic Sans Web Text", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei UI", "Segoe UI", sans-serif',
  mono: '"Anthropic Mono Web", "JetBrains Mono", "Cascadia Mono", "Cascadia Code", "Noto Sans SC", "Microsoft YaHei UI", monospace',
  writing: '"LXGW WenKai Local", "Noto Sans SC", Georgia, "Songti SC", serif'
} as const

export function safeFontName(name: string): string {
  return name.replace(/["\\\r\n]/g, '').trim().slice(0, 80)
}

export function fontStack(name: string, fallback: string): string {
  const safe = safeFontName(name)
  return safe ? `"${safe}", ${fallback}` : ''
}
