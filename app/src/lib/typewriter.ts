const COPY_STYLES = [
  'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontVariant', 'fontStretch',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'whiteSpace', 'overflowWrap', 'wordBreak', 'tabSize', 'direction'
] as const

export function createTypewriterMirror() {
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '-10000px'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.boxSizing = 'border-box'
  mirror.style.overflow = 'hidden'
  mirror.style.height = 'auto'
  mirror.style.zIndex = '-1'
  mirror.style.whiteSpace = 'pre-wrap'
  document.body.appendChild(mirror)
  return mirror
}

export function centerCaretInTextarea(textarea: HTMLTextAreaElement, mirror: HTMLDivElement) {
  if (textarea.selectionStart !== textarea.selectionEnd) return
  if (!textarea.value) {
    textarea.scrollTop = 0
    return
  }

  const style = getComputedStyle(textarea)
  mirror.style.width = `${textarea.clientWidth}px`
  for (const property of COPY_STYLES) {
    mirror.style[property] = style[property]
  }
  mirror.textContent = textarea.value.slice(0, textarea.selectionStart)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)

  const mirrorTop = mirror.getBoundingClientRect().top
  const markerRect = marker.getBoundingClientRect()
  const caretTop = markerRect.top - mirrorTop
  const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
  if (maxScroll <= 0) {
    textarea.scrollTop = 0
    return
  }

  const target = caretTop - textarea.clientHeight * .46
  textarea.scrollTop = Math.min(maxScroll, Math.max(0, target))
}
