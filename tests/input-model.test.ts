import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'

type Store = ReturnType<typeof useConfigurator>
let store: Store

beforeEach(() => {
  setActivePinia(createPinia())
  store = useConfigurator()
  localStorage.clear()
})

/**
 * Правила модели ввода. Смысл проверок один: одно и то же действие всегда
 * даёт один и тот же результат и не трогает ничего постороннего.
 */
describe('режим «Рисовать»', () => {
  it('складывает точки только в рисуемый контур и не трогает старые фигуры', () => {
    store.reset('rect')
    const before = store.shapes.length
    store.setTool('draw')
    expect(store.drawShapeId).not.toBeNull()
    expect(store.shapes).toHaveLength(before + 1)

    store.drawPoint(0, 0)
    store.drawPoint(2000, 0)
    store.drawPoint(2000, 1500)
    expect(store.activeShape.points).toHaveLength(3)
    expect(store.shapes[0].points).toHaveLength(4) // прямоугольник не тронут

    store.finishDraw(true)
    expect(store.activeShape.closed).toBe(true)
    expect(store.drawShapeId).toBeNull()
    expect(store.tool).toBe('select') // после замыкания возвращаемся в «Выбор»
    expect(store.shapes).toHaveLength(2)
  })

  it('убирает брошенный обрывок контура при выходе из режима', () => {
    store.reset('rect')
    const before = store.shapes.length
    store.setTool('draw')
    store.drawPoint(9000, 9000)
    store.setTool('select')
    expect(store.shapes).toHaveLength(before)
  })

  it('откатывает последнюю поставленную точку', () => {
    store.reset('rect')
    store.setTool('draw')
    store.drawPoint(0, 0)
    store.drawPoint(1000, 0)
    store.undoDrawPoint()
    expect(store.activeShape.points).toHaveLength(1)
  })
})

describe('правка контура', () => {
  it('врезает угол ровно в середину стороны и выделяет его', () => {
    store.reset('rect')
    const e = store.activeEdges[0]
    const midX = Math.round((e.a.x + e.b.x) / 2)
    const id = store.insertOnEdge(e.key)
    expect(store.activeShape.points).toHaveLength(5)
    expect(store.activeShape.points.find((p) => p.id === id)!.x).toBe(midX)
    expect(store.selectedPointId).toBe(id)
  })

  it('сваривает соседние вершины и отказывается сваривать несоседние', () => {
    store.reset('rect')
    const e = store.activeEdges[0]
    const id = store.insertOnEdge(e.key)!
    expect(store.weldPoints(id, e.a.id)).toBe(true)
    expect(store.activeShape.points).toHaveLength(4)
    expect(store.edges.every((x) => x.length > 0.5)).toBe(true) // нулевых сторон нет

    const pts = store.activeShape.points
    expect(store.weldPoints(pts[0].id, pts[2].id)).toBe(false)
  })

  it('удаляет выделенную сторону, но не разрушает треугольник', () => {
    store.reset('rect')
    store.selectEdge(store.activeEdges[0].key)
    store.deleteSelected()
    expect(store.activeShape.points).toHaveLength(3)
    expect(store.selectedEdgeKey).toBeNull()

    store.selectEdge(store.activeEdges[0].key)
    store.deleteSelected()
    expect(store.activeShape.points).toHaveLength(3) // меньше трёх углов контура не бывает
  })

  it('двигает фигуру целиком, не меняя её размеров', () => {
    store.reset('rect')
    const area = store.area
    const perimeter = store.perimeterMm
    store.moveShape(store.activeShapeId, 1000, -500)
    expect(store.area).toBeCloseTo(area, 0)
    expect(store.perimeterMm).toBeCloseTo(perimeter, 0)
  })
})

describe('связь чертежа и замера', () => {
  it('перенос фигуры замер не портит, а правка угла — помечает', () => {
    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000)
    expect(store.activeShape.measureDirty).toBe(false)

    store.moveShape(store.activeShapeId, 1000, -500)
    expect(store.activeShape.measureDirty).toBe(false)

    store.movePoint(store.activeShape.points[0].id, 100, 100)
    expect(store.activeShape.measureDirty).toBe(true)
  })

  it('размыкание контура сбрасывает разбивку на треугольники', () => {
    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000)
    expect(store.activeShape.triangles).toHaveLength(1)
    store.toggleClosed()
    expect(store.activeShape.triangles).toHaveLength(0)
  })

  it('основание замера живёт отдельно от выделения', () => {
    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000)
    const base = store.activeEdges[0].key
    store.setMeasureBase(base)
    store.clearSelection() // промах мышью по пустому месту
    expect(store.measureBaseKey).toBe(base)
  })
})

describe('привязка и подписи', () => {
  it('работает независимо от видимости сетки', () => {
    store.updateSettings({ snap: true, showGrid: false, gridStep: 100 })
    expect(store.maybeSnap(1234)).toBe(1200)
    store.updateSettings({ snap: false })
    expect(store.maybeSnap(1234)).toBe(1234)
  })

  it('показывает вогнутый угол как 270°, а не 90°', () => {
    store.reset('empty')
    store.insertLShape(4000, 3000, 1500, 1200)
    const degs = store.angles.map((a) => a.deg)
    expect(degs).toContain(270)
    expect(degs.reduce((s, d) => s + d, 0)).toBeCloseTo(720, 0) // сумма углов шестиугольника
  })
})

describe('эфемерное состояние', () => {
  it('инструмент и выделение не попадают в сохранение', () => {
    store.reset('rect')
    store.selectPoint(store.activeShape.points[0].id)
    store.setTool('measure')
    const dump = store.serialize()
    expect(dump).not.toContain('selectedPointId')
    expect(dump).not.toContain('"tool"')
  })

  it('после перезагрузки состояния фигуры восстанавливаются', () => {
    store.reset('empty')
    store.insertLShape(4000, 3000, 1500, 1200)
    store.triangulateActive()
    const area = store.area

    setActivePinia(createPinia())
    const fresh = useConfigurator()
    fresh.load()
    expect(fresh.area).toBeCloseTo(area, 0)
    expect(fresh.activeShape.triangles).toHaveLength(4)
    expect(fresh.tool).toBe('select') // всегда открываемся в «Выборе»
  })
})
