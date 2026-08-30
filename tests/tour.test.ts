import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { tourSteps, visibleSteps, tourSeen, markTourSeen, placeCard } from '../src/composables/useTour'
import TourOverlay from '../src/components/TourOverlay.vue'
import HelpOverlay from '../src/components/HelpOverlay.vue'

/** Ставит на страницу элементы, к которым привязаны шаги обучения. */
function stage(targets: string[]) {
  document.body.innerHTML = targets.map((t) => `<div data-tour="${t}">${t}</div>`).join('')
}

const matchMedia = {
  state: new Map<string, boolean>(),
  set(q: string, v: boolean) { this.state.set(q, v) },
}
beforeEach(() => {
  localStorage.clear()
  matchMedia.state.clear()
  window.matchMedia = ((q: string) => ({
    matches: matchMedia.state.get(q) ?? false,
    media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})
afterEach(() => { document.body.innerHTML = '' })

describe('шаги обучения', () => {
  it('каждый шаг — одна короткая фраза', () => {
    for (const s of tourSteps()) {
      expect(s.title.length).toBeLessThan(20)
      expect(s.text.length).toBeLessThan(80)
    }
  })

  it('шаги без элемента на экране пропускаются', () => {
    stage(['canvas', 'panel'])
    expect(visibleSteps().map((s) => s.target)).toEqual(['canvas', 'panel'])
  })

  it('обучение показывают один раз', () => {
    expect(tourSeen()).toBe(false)
    markTourSeen()
    expect(tourSeen()).toBe(true)
  })
})

describe('подсказка по интерфейсу', () => {
  it('ведёт по шагам вперёд и назад, в конце закрывается', async () => {
    stage(['new', 'canvas', 'panel'])
    const w = mount(TourOverlay, { attachTo: document.body })
    await nextTick()

    expect(w.find('.no').text()).toBe('1 / 3')
    expect(w.find('h3').text()).toBe('Новый потолок')

    await w.find('.primary').trigger('click')
    expect(w.find('.no').text()).toBe('2 / 3')
    await w.find('.ghost').trigger('click') // «Назад»
    expect(w.find('.no').text()).toBe('1 / 3')

    await w.find('.primary').trigger('click')
    await w.find('.primary').trigger('click')
    expect(w.find('.primary').text()).toBe('Готово')
    await w.find('.primary').trigger('click')

    expect(w.emitted('close')).toHaveLength(1)
    expect(tourSeen()).toBe(true) // пройденное обучение больше не всплывёт
    w.unmount()
  })

  it('«Пропустить» закрывает и тоже засчитывается', async () => {
    stage(['canvas'])
    const w = mount(TourOverlay, { attachTo: document.body })
    await nextTick()
    await w.find('.x').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(tourSeen()).toBe(true)
    w.unmount()
  })

  it('без единого элемента на экране просто закрывается', () => {
    stage([])
    const w = mount(TourOverlay, { attachTo: document.body })
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.find('.card').exists()).toBe(false)
    w.unmount()
  })
})

describe('окно «Как это работает»', () => {
  it('перечисляет режимы и возможности и запускает обучение', async () => {
    const w = mount(HelpOverlay)
    expect(w.findAll('.modes li')).toHaveLength(4)
    expect(w.findAll('.can li').length).toBeGreaterThanOrEqual(4)
    expect(w.text()).toContain('Выбор')

    await w.findAll('button').find((b) => b.text() === 'Короткое обучение')!.trigger('click')
    expect(w.emitted('tour')).toHaveLength(1)

    await w.findAll('button').find((b) => b.text() === 'Позже')!.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  /** На мыши показываем клавиши, на тачскрине — жесты: они не совпадают. */
  it('под мышь — клавиши, под палец — жесты', () => {
    const mouse = mount(HelpOverlay)
    expect(mouse.findAll('kbd').length).toBeGreaterThan(0)
    expect(mouse.text()).toContain('Ctrl+Z')

    matchMedia.set('(pointer: coarse)', true)
    const finger = mount(HelpOverlay)
    expect(finger.findAll('kbd')).toHaveLength(0)
    expect(finger.text()).toContain('Два пальца')
    matchMedia.set('(pointer: coarse)', false)
  })
})

describe('подпись не накрывает подсветку', () => {
  const CARD = { width: 320, height: 180 }
  const overlaps = (spot: { top: number; left: number; width: number; height: number },
    pos: { top: number; left: number }) =>
    pos.left < spot.left + spot.width && pos.left + CARD.width > spot.left
    && pos.top < spot.top + spot.height && pos.top + CARD.height > spot.top

  it('маленькую кнопку обходит снизу, у нижнего края — сверху', () => {
    const top = { top: 60, left: 40, width: 120, height: 44 }
    expect(placeCard(top, CARD, 1280, 800).top).toBe(116) // сразу под кнопкой

    const bottom = { top: 720, left: 40, width: 120, height: 44 }
    const p = placeCard(bottom, CARD, 1280, 800)
    expect(p.top).toBe(720 - 180 - 12) // над кнопкой
    expect(overlaps(bottom, p)).toBe(false)
  })

  it('высокую колонку обходит сбоку', () => {
    const side = { top: 0, left: 0, width: 240, height: 800 }
    const p = placeCard(side, CARD, 1280, 800)
    expect(p.left).toBe(252)
    expect(overlaps(side, p)).toBe(false)
  })

  it('цель во весь экран — уходит в свободный край, а не в середину', () => {
    const full = { top: 0, left: 0, width: 1280, height: 700 }
    const p = placeCard(full, CARD, 1280, 800)
    expect(p.top).toBe(800 - 180 - 8) // ниже цели места больше
    expect(p.left + CARD.width).toBeLessThanOrEqual(1280)
  })

  it('в любом положении остаётся в экране', () => {
    for (const spot of [
      { top: -20, left: -30, width: 100, height: 40 },
      { top: 780, left: 1240, width: 60, height: 60 },
      { top: 300, left: 600, width: 40, height: 40 },
    ]) {
      const p = placeCard(spot, CARD, 1280, 800)
      expect(p.top).toBeGreaterThanOrEqual(8)
      expect(p.left).toBeGreaterThanOrEqual(8)
      expect(p.top + CARD.height).toBeLessThanOrEqual(800)
      expect(p.left + CARD.width).toBeLessThanOrEqual(1280)
    }
  })
})
