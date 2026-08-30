import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { FILM_PER_M2, GARPUN_PER_M, WORK_PER_M2 } from '../src/pricing'

let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  setActivePinia(createPinia())
  store = useConfigurator()
  localStorage.clear()
  store.reset('empty')
})

/** Прямоугольник в мм — считать по нему цену можно на бумаге. */
function rect(x: number, y: number, w: number, h: number): string {
  store.setTool('draw')
  for (const p of [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]) {
    store.drawPoint(p.x, p.y, false)
  }
  store.finishDraw(true)
  return store.activeShapeId
}
const statsOf = (id: string) => store.shapeStats.find((s) => s.id === id)!

describe('цена по статичному прайсу', () => {
  it('считается по площади, периметру и плёнке', () => {
    const id = rect(0, 0, 4000, 3000) // 12 м², периметр 14 м, гарпун по умолчанию везде
    const s = statsOf(id)
    expect(s.areaM2).toBeCloseTo(12, 3)
    expect(s.perimM).toBeCloseTo(14, 3)
    expect(s.price).toBeCloseTo(12 * (FILM_PER_M2['gloss'] + WORK_PER_M2) + 14 * GARPUN_PER_M, 3)
  })

  it('плёнка меняет цену полотна', () => {
    const id = rect(0, 0, 4000, 3000)
    const before = statsOf(id).price
    store.setShapeFilm(id, 'texture')
    expect(statsOf(id).price).toBeGreaterThan(before)
    expect(statsOf(id).price - before).toBeCloseTo(12 * (FILM_PER_M2['texture'] - FILM_PER_M2['gloss']), 3)
  })

  it('вырез уменьшает площадь и цену, но добавляет обвод', () => {
    const id = rect(0, 0, 4000, 3000)
    const full = statsOf(id)
    const hole = rect(1000, 1000, 1000, 1000) // 1 м², обвод 4 м
    store.setShapeKind(hole, 'hole')

    const s = statsOf(id)
    expect(s.areaM2).toBeCloseTo(11, 3)
    expect(s.perimM).toBeCloseTo(18, 3)
    expect(s.price).toBeLessThan(full.price)
    expect(store.shapeStats.some((x) => x.id === hole)).toBe(false) // вырез не полотно
  })

  it('итог по чертежу — сумма полотен', () => {
    const a = rect(0, 0, 4000, 3000)
    const b = rect(6000, 0, 2000, 2000)
    store.setShapeLevel(b, 2, 150)
    store.setShapeFilm(b, 'mat')

    expect(store.totals.areaM2).toBeCloseTo(statsOf(a).areaM2 + statsOf(b).areaM2, 3)
    expect(store.totals.price).toBeCloseTo(statsOf(a).price + statsOf(b).price, 3)
  })

  it('цифры выбранного полотна — про него, а не про весь чертёж', () => {
    rect(0, 0, 4000, 3000)
    const b = rect(6000, 0, 2000, 2000)
    store.setActiveShape(b)
    expect(store.activeStats.areaM2).toBeCloseTo(4, 3)
    expect(store.totals.areaM2).toBeCloseTo(16, 3)
  })
})
