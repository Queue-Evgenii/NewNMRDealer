import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'

let store: ReturnType<typeof useConfigurator>
beforeEach(() => { setActivePinia(createPinia()); store = useConfigurator(); localStorage.clear() })

function drawShape(pts: { x: number; y: number }[]): string {
  store.setTool('draw')
  for (const p of pts) store.drawPoint(p.x, p.y, false)
  store.finishDraw(true)
  return store.activeShapeId
}

/**
 * Боевая сцена: внешний контур со скосами и дугой, внутри полотно, а в нём ещё
 * одно. Ровно на такой конфигурации разбивка игнорировала вложенные углы.
 */
describe('сложная сцена с вложенностью', () => {
  it('внешний 12-угольник со скосами и дугой, внутри фигура, в ней ещё одна', () => {
    store.reset('empty')

    // внешний контур: скосы 424 по левому краю, ступень снизу, скос справа
    const outer = drawShape([
      { x: 300, y: 0 }, { x: 3300, y: 0 }, { x: 3830, y: 530 }, { x: 3830, y: 1530 },
      { x: 3300, y: 2060 }, { x: 2800, y: 2060 }, { x: 2300, y: 1560 }, { x: 1800, y: 1560 },
      { x: 1300, y: 2060 }, { x: 300, y: 2060 }, { x: 0, y: 1760 }, { x: 0, y: 300 },
    ])
    // дуга на правой стороне — как 1006 на чертеже
    const right = store.activeEdges.find((e) => Math.abs(e.chord - 1000) < 40 && e.a.x > 3000)
    if (right) store.setEdgeBulge(right.key, 0.35)

    const q = drawShape([
      { x: 1100, y: 400 }, { x: 2100, y: 400 }, { x: 2500, y: 700 }, { x: 1300, y: 1000 },
    ])
    const s = drawShape([
      { x: 1500, y: 550 }, { x: 1900, y: 600 }, { x: 2100, y: 650 }, { x: 1800, y: 800 }, { x: 1550, y: 750 },
    ])


    store.setActiveShape(outer)
    const view = store.shapesView.find((v) => v.id === outer)!

    const err = store.triangulateActive()

    const qIds = store.shapes.find((x) => x.id === q)!.points.map((p) => p.id)
    const used = new Set(store.activeShape.triangles.flatMap((t) => [t.a, t.b, t.c]))
    const missing = qIds.filter((id) => !used.has(id))

    expect(s).toBeTruthy()
    expect(err, 'разбивка не должна падать').toBeNull()
    expect(view.holes, 'вложенное полотно не опознано как вырез').toHaveLength(1)
    expect(missing, 'углы вложенной фигуры не вошли в сетку').toHaveLength(0)
    expect(store.triangleAreaM2).toBeCloseTo(store.activeChordAreaM2, 2)
    expect(store.activeHoleCount).toBe(1)
  })
})
