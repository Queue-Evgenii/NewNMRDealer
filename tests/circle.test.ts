import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { arcRadius } from '../src/composables/useArcs'

let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  setActivePinia(createPinia())
  store = useConfigurator()
  localStorage.clear()
})

describe('круглый потолок', () => {
  it('четыре четверти дуги дают настоящий круг', () => {
    store.insertCircle(4000)
    const r = 2000
    const s = store.shapeStats[0]
    expect(store.activeShape.points).toHaveLength(4)
    // ломаная по дуге чуть беднее круга, отсюда допуск в полпроцента
    expect(s.areaM2).toBeCloseTo((Math.PI * r * r) / 1e6, 1)
    expect(s.perimM).toBeCloseTo((2 * Math.PI * r) / 1000, 1)
    expect(s.areaM2 / (Math.PI * r * r / 1e6)).toBeGreaterThan(0.995)
  })

  it('дуги выгнуты наружу, а не внутрь', () => {
    store.insertCircle(2000)
    // у вписанного квадрата было бы 2 м², у круга — π
    expect(store.shapeStats[0].areaM2).toBeGreaterThan(3)
  })
})

describe('скругление стороны', () => {
  it('стрелка задаёт дугу, «выпрямить» её убирает', () => {
    store.insertRectangle(4000, 3000)
    const top = store.activeEdges.find((e) => e.a.y === 0 && e.b.y === 0)!
    const flat = store.shapeStats[0].areaM2

    store.setEdgeSagitta(top.key, 500)
    const arc = store.activeEdges.find((e) => e.key === top.key)!
    expect(arc.props.bulge).not.toBe(0)
    expect(arc.length).toBeGreaterThan(arc.chord)
    // сегмент дуги добавляет площади примерно 2/3 * хорда * стрелка
    expect(store.shapeStats[0].areaM2 - flat).toBeCloseTo((2 / 3 * 4000 * 500) / 1e6, 1)

    store.straightenEdge(top.key)
    expect(store.activeEdges.find((e) => e.key === top.key)!.props.bulge).toBe(0)
    expect(store.shapeStats[0].areaM2).toBeCloseTo(flat, 3)
  })
})

describe('скругление угла', () => {
  /** Прямоугольник 4000×3000; скругляем правый нижний угол. */
  function rect() {
    store.insertRectangle(4000, 3000)
    return store.activeShape
  }

  it('угол заменяется дугой заданного радиуса', () => {
    const s = rect()
    const flat = store.shapeStats[0].areaM2
    const corner = s.points.find((p) => p.x === 4000 && p.y === 3000)!

    const r = store.roundCorner(corner.id, 500)
    expect(r).toBe(500)
    expect(store.activeShape.points).toHaveLength(5) // угол ушёл, вместо него две касательные
    expect(store.activeShape.points.some((p) => p.id === corner.id)).toBe(false)

    const arc = store.activeEdges.find((e) => e.props.bulge !== 0)!
    expect(arcRadius(arc.a, arc.b, arc.props.bulge)).toBeCloseTo(500, 0)
    // прямой угол теряет R²(1 − π/4) площади
    expect(flat - store.shapeStats[0].areaM2).toBeCloseTo((500 * 500 * (1 - Math.PI / 4)) / 1e6, 3)
  })

  it('дуга срезает угол, а не выпирает наружу', () => {
    const s = rect()
    const corner = s.points.find((p) => p.x === 4000 && p.y === 3000)!
    store.roundCorner(corner.id, 500)
    expect(store.shapeStats[0].areaM2).toBeLessThan(12)
  })

  it('слишком большой радиус ужимается до половины стороны', () => {
    const s = rect()
    const corner = s.points.find((p) => p.x === 4000 && p.y === 3000)!
    const r = store.roundCorner(corner.id, 99000)
    expect(r).toBe(1500) // половина короткой стороны
    expect(store.shapeStats[0].areaM2).toBeGreaterThan(0)
  })

  it('на прямой и на разомкнутом контуре ничего не делает', () => {
    store.reset('empty')
    store.setTool('draw')
    for (const p of [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1500 }]) store.drawPoint(p.x, p.y, false)
    store.finishDraw(false)
    expect(store.roundCorner(store.activeShape.points[1].id, 300)).toBe(0)

    store.insertRectangle(4000, 3000)
    const mid = store.insertOnEdge(store.activeEdges[0].key)!
    expect(store.roundCorner(mid, 300)).toBe(0) // точка на прямой — угла нет
  })
})

describe('несимметричный изгиб', () => {
  it('деление дуги не меняет форму, а половины гнутся по отдельности', () => {
    store.insertRectangle(4000, 3000)
    const top = store.activeEdges.find((e) => e.a.y === 0 && e.b.y === 0)!
    store.setEdgeSagitta(top.key, 400)
    const bent = store.activeEdges.find((e) => e.key === top.key)!
    const r0 = arcRadius(bent.a, bent.b, bent.props.bulge)
    const before = store.shapeStats[0]

    const id = store.insertOnEdge(top.key)!
    expect(store.activeShape.points).toHaveLength(5)
    const halves = store.activeEdges.filter((e) => e.a.id === id || e.b.id === id)
    expect(halves).toHaveLength(2)
    // форма та же: обе половины остались на исходной окружности
    for (const h of halves) expect(arcRadius(h.a, h.b, h.props.bulge)).toBeCloseTo(r0, -1)
    expect(store.shapeStats[0].areaM2).toBeCloseTo(before.areaM2, 2)
    expect(store.shapeStats[0].perimM).toBeCloseTo(before.perimM, 2)

    // одну половину гнём сильнее — контур становится несимметричным
    store.setEdgeSagitta(halves[0].key, 800)
    const left = store.activeEdges.find((e) => e.key === halves[0].key)!
    const right = store.activeEdges.find((e) => e.key === halves[1].key)!
    expect(Math.abs(left.props.bulge)).toBeGreaterThan(Math.abs(right.props.bulge))
  })
})
