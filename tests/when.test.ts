import { describe, it, expect } from 'vitest'
import { shortWhen, savedWhen } from '../src/composables/useWhen'

const DAY = 24 * 3600_000
/** Полдень — чтобы сдвиг часового пояса не унёс дату во вчера или завтра. */
function noon(daysAgo = 0): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime() - daysAgo * DAY
}

describe('человеческие даты', () => {
  it('сегодня — только время', () => {
    expect(shortWhen(noon())).toMatch(/^\d{2}:\d{2}$/)
    expect(savedWhen(noon())).toMatch(/^сохранено \d{2}:\d{2}$/)
  })

  it('вчера названо словом', () => {
    expect(shortWhen(noon(1))).toBe('вчера')
    expect(savedWhen(noon(1))).toMatch(/^сохранено вчера \d{2}:\d{2}$/)
  })

  it('давнее — числом и месяцем', () => {
    expect(shortWhen(noon(10))).not.toMatch(/:/)
    expect(savedWhen(noon(10))).toMatch(/^сохранено .+ \d{2}:\d{2}$/)
  })
})
