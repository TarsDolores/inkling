import { describe, expect, it } from 'vitest'
import { getTimeGreeting } from './greeting'

function at(hour: number) {
  return new Date(2026, 9, 25, hour, 0, 0)
}

describe('getTimeGreeting', () => {
  it('uses the morning greeting from 05:00 to 11:59', () => {
    expect(getTimeGreeting(at(5))).toBe('早上好，想写点什么？')
    expect(getTimeGreeting(at(11))).toBe('早上好，想写点什么？')
  })

  it('uses the noon greeting from 12:00 to 17:59', () => {
    expect(getTimeGreeting(at(12))).toBe('中午好，有什么新鲜事吗？')
    expect(getTimeGreeting(at(17))).toBe('中午好，有什么新鲜事吗？')
  })

  it('uses the evening greeting at night and after 18:00', () => {
    expect(getTimeGreeting(at(18))).toBe('晚上好，想写点什么？')
    expect(getTimeGreeting(at(1))).toBe('晚上好，想写点什么？')
  })
})
