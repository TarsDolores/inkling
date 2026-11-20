import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows recovery actions instead of a blank page when a view crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    expect(screen.getByText('随记遇到一个界面问题')).toBeTruthy()
    expect(screen.getByRole('button', { name: /重新载入/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /下载最近备份/ })).toBeTruthy()
  })
})
