import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../types'
import { Editor } from './Editor'

const mocks = vi.hoisted(() => ({
  saveNote: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
  storeEmergencyDraft: vi.fn(),
  clearEmergencyDraft: vi.fn()
}))

const note: Note = {
  id: 'ime-test', title: '', content: '标题\n', topicId: 'fleeting', tags: [],
  createdAt: 1, updatedAt: 1, accumulatedWritingSeconds: 0, wordCount: 2, pinned: false
}

vi.mock('../store/useAppStore', () => ({
  useAppStore: () => ({
    notes: [note], activeNoteId: note.id,
    topics: [{ id: 'fleeting', name: '闪念', color: '#708b82' }],
    settings: { typewriterMode: false },
    saveNote: mocks.saveNote, showToast: mocks.showToast
  })
}))

vi.mock('../data/db', () => ({
  storeEmergencyDraft: mocks.storeEmergencyDraft,
  clearEmergencyDraft: mocks.clearEmergencyDraft
}))

describe('Editor IME composition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps pinyin and the caret intact until Chinese text is committed, then indents and saves', async () => {
    render(<Editor />)
    const input = screen.getByLabelText('文章正文') as HTMLTextAreaElement
    fireEvent.compositionStart(input)
    for (const pinyin of ['y', 'yu', 'yua', 'yuan', 'yuan shen']) {
      fireEvent.change(input, { target: { value: `标题\n${pinyin}` } })
      expect(input.value).toBe(`标题\n${pinyin}`)
      expect(input.selectionStart).toBe(input.value.length)
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.saveNote).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '标题\n原神' } })
    expect(input.value).toBe('标题\n原神')
    fireEvent.compositionEnd(input, { data: '原神' })
    expect(input.value).toBe('标题\n　　原神')
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(input.selectionStart).toBe(input.value.length)
    expect(mocks.saveNote).toHaveBeenLastCalledWith(expect.objectContaining({ content: '标题\n　　原神' }))
    expect(screen.getByText('已保存')).toBeTruthy()
  })

  it('does not run a queued caret adjustment after another composition has started', async () => {
    render(<Editor />)
    const input = screen.getByLabelText('文章正文') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '标题\n原神' } })
    const setSelection = vi.spyOn(input, 'setSelectionRange')
    fireEvent.compositionStart(input)
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    expect(setSelection).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(mocks.saveNote).not.toHaveBeenCalled()
  })

  it('still indents pasted paragraphs and ordinary input', async () => {
    render(<Editor />)
    const input = screen.getByLabelText('文章正文') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '标题\n原神\n第二段' } })
    expect(input.value).toBe('标题\n　　原神\n　　第二段')
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(mocks.saveNote).toHaveBeenLastCalledWith(expect.objectContaining({ content: input.value }))
  })

  it('shows a failed save state and keeps the emergency draft when saving fails', async () => {
    mocks.saveNote.mockRejectedValueOnce(new Error('disk busy'))
    render(<Editor />)
    const input = screen.getByLabelText('文章正文') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '标题\n新的段落' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(screen.getByText('保存失败')).toBeTruthy()
    expect(mocks.storeEmergencyDraft).toHaveBeenCalled()
    expect(mocks.showToast).toHaveBeenCalledWith('保存失败，草稿仍保留在浏览器中')
  })
})
