import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import CeilingCanvas2D from '../src/components/CeilingCanvas2D.vue'

/**
 * Тяга ручек на холсте: единственный способ проверить, что нажатие и
 * перетаскивание доходят до модели. jsdom не считает раскладку, поэтому
 * размеры отдаём сами, а экранные координаты берём из viewBox.
 */
const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useConfigurator>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  store = useConfigurator()
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  })
  Element.prototype.getBoundingClientRect = () => RECT as DOMRect
})

async function canvas() {
  const w = mount(CeilingCanvas2D, { global: { plugins: [pinia] } })
  await nextTick() // после монтирования холст вписывает чертёж — viewBox меняется
  const svg = w.find('svg')
  const [panX, panY, vw] = (svg.attributes('viewBox') as string).split(' ').map(Number)
  const mmPerPx = vw / RECT.width
  /** jsdom не даёт подменить clientX у MouseEvent — шлём обычное событие. */
  const fire = async (type: string, x: number, y: number) => {
    const ev = new Event(type, { bubbles: true }) as Event & Record<string, unknown>
    ev.clientX = (x - panX) / mmPerPx
    ev.clientY = (y - panY) / mmPerPx
    ev.pointerId = 1
    ev.button = 0
    svg.element.dispatchEvent(ev)
    await nextTick()
  }
  return { w, svg, fire }
}

/** Ручка середины стороны в мм — та самая (+) на чертеже. */
function midHandle(w: ReturnType<typeof canvas>['w']) {
  const h = w.findAll('.mid-handle')[0]
  return { x: Number(h.attributes('cx')), y: Number(h.attributes('cy')) }
}

describe('ручка (+) на стороне', () => {
  it('врезает угол и тянется за указателем', async () => {
    store.insertRectangle(4000, 3000)
    store.updateSettings({ snap: false })
    const c = await canvas()

    const before = store.activeShape.points.length
    const h = midHandle(c.w)

    await c.fire('pointerdown', h.x, h.y)
    await c.fire('pointermove', h.x, h.y - 600)
    await c.fire('pointerup', h.x, h.y - 600)

    expect(store.activeShape.points).toHaveLength(before + 1)
    const moved = store.activeShape.points[1]
    expect(moved.x).toBeCloseTo(h.x, 0)
    expect(moved.y).toBeCloseTo(h.y - 600, 0)
  })

  /**
   * Привязки не должны спорить: угол кратно 15° раньше тут же округлялся по
   * сетке, и точка вставала не на луч, а рядом — тяга выглядела сломанной.
   */
  it('с привязкой встаёт ровно на луч кратный 15°', async () => {
    store.insertRectangle(4000, 3000)
    const c = await canvas()
    const h = midHandle(c.w)

    await c.fire('pointerdown', h.x, h.y)
    await c.fire('pointermove', h.x, h.y - 600)
    await c.fire('pointerup', h.x, h.y - 600)

    const p = store.activeShape.points[1]
    const prev = store.activeShape.points[0]
    const deg = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI
    expect(Math.abs(deg - Math.round(deg / 15) * 15)).toBeLessThan(0.1)
    expect(p.y % 100).not.toBe(0) // сетка луч больше не перебивает
  })
  it('без перетаскивания просто врезает угол по центру стороны', async () => {
    store.insertRectangle(4000, 3000)
    const c = await canvas()
    const h = midHandle(c.w)

    await c.fire('pointerdown', h.x, h.y)
    await c.fire('pointerup', h.x, h.y)

    expect(store.activeShape.points).toHaveLength(5)
    expect(store.activeShape.points.some((p) => p.x === h.x && p.y === h.y)).toBe(true)
  })
})

describe('ручка кривизны на дуге', () => {
  it('тянет прогиб стороны', async () => {
    store.insertRectangle(4000, 3000)
    const top = store.activeEdges.find((e) => e.a.y === 0 && e.b.y === 0)!
    store.setEdgeSagitta(top.key, 200)

    const c = await canvas()
    const handle = c.w.find('.arc-handle')
    expect(handle.exists()).toBe(true)
    const hx = Number(handle.attributes('cx'))
    const hy = Number(handle.attributes('cy'))

    await c.fire('pointerdown', hx, hy)
    await c.fire('pointermove', hx, hy - 500)
    await c.fire('pointerup', hx, hy - 500)

    const after = store.activeEdges.find((e) => e.key === top.key)!
    expect(Math.abs((after.chord * after.props.bulge) / 2)).toBeGreaterThan(600)
  })
})
