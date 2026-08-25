import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { encodeModel, decodeModel } from '../src/composables/useShareLink'
import type { SerializedModel } from '../src/types'

let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  setActivePinia(createPinia())
  store = useConfigurator()
  localStorage.clear()
})

function drawShape(pts: { x: number; y: number }[]): string {
  store.setTool('draw')
  for (const p of pts) store.drawPoint(p.x, p.y, false)
  store.finishDraw(true)
  return store.activeShapeId
}
const model = () => JSON.parse(store.serialize()) as SerializedModel

/** Комната со скосами, вложенным полотном, дугой и разбивкой — рабочий случай. */
function realScene() {
  store.reset('empty')
  const outer = drawShape([
    { x: 300, y: 0 }, { x: 3300, y: 0 }, { x: 3830, y: 530 }, { x: 3830, y: 1530 },
    { x: 3300, y: 2060 }, { x: 2800, y: 2060 }, { x: 2300, y: 1560 }, { x: 1800, y: 1560 },
    { x: 1300, y: 2060 }, { x: 300, y: 2060 }, { x: 0, y: 1760 }, { x: 0, y: 300 },
  ])
  const arc = store.activeEdges.find((e) => Math.abs(e.chord - 1000) < 40 && e.a.x > 3000)
  if (arc) store.setEdgeBulge(arc.key, 0.35)
  const inner = drawShape([
    { x: 1100, y: 400 }, { x: 2100, y: 400 }, { x: 2500, y: 700 }, { x: 1300, y: 1000 },
  ])
  store.setShapeLevel(inner, 2, 120)
  store.setActiveShape(outer)
  store.triangulateActive()
  store.updateOrder({ client: 'Иванов', color: 'Белый матовый' })
  return { outer, inner }
}

describe('ссылка на чертёж', () => {
  it('чертёж помещается в адресную строку', async () => {
    realScene()
    const payload = await encodeModel(model())
    const url = `https://nmr.example/app/#/?d=${payload}`
    console.log('  JSON модели:', store.serialize().length, 'символов')
    console.log('  ссылка:', url.length, 'символов')
    expect(url.length).toBeLessThan(2000) // влезает даже в самые строгие лимиты
  })

  it('чертёж восстанавливается из ссылки без потерь', async () => {
    realScene()
    const before = {
      area: store.area,
      perimeter: store.perimeterMm,
      shapes: store.shapes.length,
      triangles: store.activeShape.triangles.length,
      levels: store.levelStats.length,
      client: store.order.client,
    }

    const payload = await encodeModel(model())
    const restored = await decodeModel(payload)
    expect(restored).not.toBeNull()

    setActivePinia(createPinia())
    const fresh = useConfigurator()
    fresh.applySerialized(restored!)
    fresh.setActiveShape(fresh.shapes[0].id)

    expect(fresh.shapes).toHaveLength(before.shapes)
    expect(fresh.area).toBeCloseTo(before.area, 0)
    expect(fresh.perimeterMm).toBeCloseTo(before.perimeter, 0)
    expect(fresh.activeShape.triangles).toHaveLength(before.triangles)
    expect(fresh.levelStats).toHaveLength(before.levels)
    expect(fresh.order.client).toBe(before.client)
  })

  it('переносит скругления, вырезы, ярусы и замер', async () => {
    store.reset('empty')
    const outer = drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const e = store.activeEdges[0]
    store.setEdgeBulge(e.key, 0.5)
    store.setEdgeProp(store.activeEdges[1].key, 'seam', true)
    const hole = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeKind(hole, 'hole')
    store.setActiveShape(outer)
    store.triangulateActive()

    const restored = await decodeModel(await encodeModel(model()))
    setActivePinia(createPinia())
    const fresh = useConfigurator()
    fresh.applySerialized(restored!)
    fresh.setActiveShape(fresh.shapes[0].id)

    expect(fresh.arcRows).toHaveLength(1)
    expect(fresh.arcRows[0].sagitta).toBe(1000)
    expect(fresh.edges.some((x) => x.props.seam)).toBe(true)
    expect(fresh.shapes[1].kind).toBe('hole')
    expect(fresh.activeHoleCount).toBe(1)
    expect(fresh.triangleAreaM2).toBeCloseTo(fresh.activeChordAreaM2, 2)
  })

  it('битую ссылку не принимает', async () => {
    expect(await decodeModel('zНЕПОНЯТНО')).toBeNull()
    expect(await decodeModel('')).toBeNull()
    expect(await decodeModel('rW10')).toBeNull() // валидный base64, но не наша модель
  })

  it('большой чертёж на 200 углов всё ещё влезает', async () => {
    store.reset('empty')
    const pts = Array.from({ length: 200 }, (_, i) => ({
      x: Math.round(5000 + 4000 * Math.cos((i / 200) * Math.PI * 2)),
      y: Math.round(5000 + 3000 * Math.sin((i / 200) * Math.PI * 2)),
    }))
    drawShape(pts)
    store.triangulateActive()
    const payload = await encodeModel(model())
    console.log('  200 углов + разбивка:', payload.length, 'символов')
    expect(payload.length).toBeLessThan(8000)
  })
})
