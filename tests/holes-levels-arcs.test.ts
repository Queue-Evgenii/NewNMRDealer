import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { arcSagitta, arcRadius, bulgeFromSagitta, bulgeFromRadius } from '../src/composables/useArcs'

type Store = ReturnType<typeof useConfigurator>
let store: Store

beforeEach(() => {
  setActivePinia(createPinia())
  store = useConfigurator()
  localStorage.clear()
})

/** Рисует замкнутый контур по координатам и возвращает его id. */
function drawShape(pts: { x: number; y: number }[]): string {
  store.setTool('draw')
  for (const p of pts) store.drawPoint(p.x, p.y, false)
  store.finishDraw(true)
  return store.activeShapeId
}

describe('вырезы в потолке', () => {
  it('дыра вычитается из полотна, внутри которого нарисована', () => {
    store.reset('empty')
    const ceiling = drawShape([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }])
    expect(store.area / 1e6).toBeCloseTo(6, 3)

    // колонна 1000×1000 посреди комнаты
    const hole = drawShape([{ x: 1000, y: 500 }, { x: 2000, y: 500 }, { x: 2000, y: 1500 }, { x: 1000, y: 1500 }])
    // вложенный контур вырезает полотно сразу: два полотна не лежат друг на друге,
    // поэтому 6 = 5 (верхнее с дыркой) + 1 (вложенное)
    expect(store.area / 1e6).toBeCloseTo(6, 3)

    store.setShapeKind(hole, 'hole')
    expect(store.area / 1e6).toBeCloseTo(5, 3) // 6 минус 1
    expect(store.holeArea / 1e6).toBeCloseTo(1, 3)
    expect(ceiling).toBeTruthy()
  })

  it('обвод выреза входит в периметр — его тоже крепят', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }])
    const hole = drawShape([{ x: 1000, y: 500 }, { x: 2000, y: 500 }, { x: 2000, y: 1500 }, { x: 1000, y: 1500 }])
    store.setShapeKind(hole, 'hole')
    // 10 м по стенам + 4 м обвода колонны
    expect(store.perimeterMm).toBeCloseTo(14000, 0)
  })

  it('вырез, нарисованный снаружи, ничего не вычитает', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }])
    const outside = drawShape([{ x: 5000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 1000 }, { x: 5000, y: 1000 }])
    store.setShapeKind(outside, 'hole')
    expect(store.area / 1e6).toBeCloseTo(6, 3)
    expect(store.holeArea).toBe(0)
  })

  it('дыра любой формы, а не только прямоугольная', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    // Г-образный короб внутри
    const hole = drawShape([
      { x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 1500 },
      { x: 1500, y: 1500 }, { x: 1500, y: 2000 }, { x: 1000, y: 2000 },
    ])
    store.setShapeKind(hole, 'hole')
    // 2000×500 + 500×500 = 1.25 м²
    expect(store.holeArea / 1e6).toBeCloseTo(1.25, 3)
    expect(store.area / 1e6).toBeCloseTo(12 - 1.25, 3)
  })
})

describe('многоярусный потолок', () => {
  it('считает площадь и периметр по каждому ярусу отдельно', () => {
    store.reset('empty')
    const top = drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    // проём под нижний ярус
    const opening = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeKind(opening, 'hole')
    // сам нижний ярус — полотно того же размера, опущенное на 150 мм
    const lower = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeLevel(lower, 2, 150)

    const stats = store.levelStats
    expect(stats).toHaveLength(2)
    expect(stats[0].level).toBe(1)
    expect(stats[0].areaM2).toBeCloseTo(12 - 2, 3) // верхний ярус минус проём
    expect(stats[0].perimeterM).toBeCloseTo(14 + 6, 3) // стены + обвод проёма
    expect(stats[1].level).toBe(2)
    expect(stats[1].drop).toBe(150)
    expect(stats[1].areaM2).toBeCloseTo(2, 3)
    expect(stats[1].perimeterM).toBeCloseTo(6, 3)

    // общая площадь полотна — сумма ярусов
    expect(store.area / 1e6).toBeCloseTo(12, 3)
    expect(top).toBeTruthy()
  })

  it('ярус по умолчанию первый, без перепада', () => {
    store.reset('rect')
    expect(store.activeShape.level).toBe(1)
    expect(store.activeShape.drop).toBe(0)
    expect(store.activeShape.kind).toBe('ceiling')
  })
})

describe('скруглённые стороны', () => {
  /** Прямоугольник 4000×2000 с двумя полукруглыми торцами: «стадион». */
  function stadium() {
    store.reset('empty')
    store.insertRectangle(4000, 2000)
    const short = store.activeEdges.filter((e) => Math.abs(e.chord - 2000) < 1)
    expect(short).toHaveLength(2)
    for (const e of short) store.setEdgeBulge(e.key, 1) // полукруг наружу
    return short.map((e) => e.key)
  }

  it('площадь и периметр считаются по дуге, а не по хорде', () => {
    stadium()
    // 4000×2000 плюс два полукруга R=1000 = целый круг
    expect(store.area / 1e6).toBeCloseTo((8_000_000 + Math.PI * 1000 ** 2) / 1e6, 2)
    // две прямые стены по 4000 плюс полная окружность
    expect(store.perimeterMm).toBeCloseTo(8000 + 2 * Math.PI * 1000, 0)
  })

  it('стрелку и радиус выдаёт в замер', () => {
    const keys = stadium()
    const e = store.edges.find((x) => x.key === keys[0])!
    expect(arcSagitta(e.a, e.b, e.props.bulge)).toBeCloseTo(1000, 0) // стрелка полукруга = R
    expect(arcRadius(e.a, e.b, e.props.bulge)).toBeCloseTo(1000, 0)

    const rows = store.arcRows
    expect(rows).toHaveLength(2)
    expect(rows[0].chord).toBe(2000)
    expect(rows[0].sagitta).toBe(1000)
    expect(rows[0].radius).toBe(1000)
    expect(rows[0].length).toBe(Math.round(Math.PI * 1000))
  })

  it('принимает замер «хорда + стрелка» и радиус', () => {
    store.reset('empty')
    store.insertRectangle(4000, 2000)
    const e = store.activeEdges.find((x) => Math.abs(x.chord - 2000) < 1)!

    store.setEdgeSagitta(e.key, 250) // пологая дуга
    const after = store.edges.find((x) => x.key === e.key)!
    expect(arcSagitta(after.a, after.b, after.props.bulge)).toBeCloseTo(250, 0)
    // R = (c²/4 + s²) / (2s) = (1_000_000 + 62_500) / 500
    expect(arcRadius(after.a, after.b, after.props.bulge)).toBeCloseTo(2125, 0)

    store.setEdgeRadius(e.key, 1500)
    const byRadius = store.edges.find((x) => x.key === e.key)!
    expect(arcRadius(byRadius.a, byRadius.b, byRadius.props.bulge)).toBeCloseTo(1500, 0)
  })

  it('дугу можно перекинуть на другую сторону и выпрямить', () => {
    const keys = stadium()
    const areaOut = store.area
    store.flipEdgeArc(keys[0])
    expect(store.area).toBeLessThan(areaOut) // дуга ушла внутрь — площадь меньше

    store.straightenEdge(keys[0])
    store.straightenEdge(keys[1])
    expect(store.area / 1e6).toBeCloseTo(8, 3) // снова прямоугольник
    expect(store.arcRows).toHaveLength(0)
  })

  it('перевод замера в кривизну и обратно сходится', () => {
    expect(bulgeFromSagitta(2000, 1000)).toBeCloseTo(1, 6) // полукруг
    expect(bulgeFromRadius(2000, 1000)).toBeCloseTo(1, 6)
    expect(bulgeFromRadius(2000, 900)).toBe(0) // радиус меньше половины хорды невозможен
  })
})

describe('замер и скругления вместе', () => {
  it('сумма треугольников сверяется с площадью по хордам, дуги идут отдельно', () => {
    store.reset('empty')
    store.insertRectangle(4000, 2000)
    const short = store.activeEdges.find((e) => Math.abs(e.chord - 2000) < 1)!
    store.setEdgeBulge(short.key, 1) // полукруг наружу
    store.triangulateActive()

    // треугольники кроют многоугольник по хордам — 8 м²
    expect(store.activeChordAreaM2).toBeCloseTo(8, 3)
    expect(store.triangleAreaM2).toBeCloseTo(8, 3)
    // а полная площадь больше на полукруг R=1000
    expect(store.activeAreaM2).toBeCloseTo(8 + (Math.PI * 1000 ** 2) / 2 / 1e6, 2)

    const rows = store.arcRows
    expect(rows).toHaveLength(1)
    expect(rows[0].sagitta).toBe(1000)
  })

  it('усадка считается от площади с вырезами', () => {
    store.reset('empty')
    store.insertRectangle(4000, 2000) // 8 м²
    store.updateSettings({ usad: 10 })
    expect(store.cutAreaM2).toBeCloseTo(8 * 0.9 * 0.9, 3)
  })
})

describe('слои: разбор потолка по ярусам', () => {
  function threeLevels() {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const mid = drawShape([{ x: 500, y: 500 }, { x: 3500, y: 500 }, { x: 3500, y: 2500 }, { x: 500, y: 2500 }])
    store.setShapeLevel(mid, 2, 100)
    const low = drawShape([{ x: 1500, y: 1200 }, { x: 2500, y: 1200 }, { x: 2500, y: 1800 }, { x: 1500, y: 1800 }])
    store.setShapeLevel(low, 3, 200)
    return { mid, low }
  }

  it('показывает ярусы по одному', () => {
    threeLevels()
    expect(store.levelStats).toHaveLength(3)
    expect(store.levelStats.every((l) => l.visible)).toBe(true)

    store.showUpToLevel(1)
    expect(store.levelStats.map((l) => l.visible)).toEqual([true, false, false])
    store.showUpToLevel(2)
    expect(store.levelStats.map((l) => l.visible)).toEqual([true, true, false])
    store.showAllLevels()
    expect(store.levelStats.every((l) => l.visible)).toBe(true)
  })

  it('прячет и изолирует отдельный ярус', () => {
    threeLevels()
    store.toggleLevelVisible(2)
    expect(store.levelStats.map((l) => l.visible)).toEqual([true, false, true])
    store.toggleLevelVisible(2)
    expect(store.levelStats.every((l) => l.visible)).toBe(true)

    store.isolateLevel(3)
    expect(store.levelStats.map((l) => l.visible)).toEqual([false, false, true])
  })

  it('скрытые ярусы не рисуются, но из расчёта не исчезают', () => {
    threeLevels()
    const area = store.area
    store.showUpToLevel(1)
    expect(store.shapesView.filter((s) => s.visible)).toHaveLength(1)
    expect(store.area).toBeCloseTo(area, 0) // смета считает весь потолок
  })

  it('активная фигура уходит с прячущегося яруса', () => {
    const { low } = threeLevels()
    store.setActiveShape(low)
    expect(store.activeShape.level).toBe(3)
    store.showUpToLevel(1)
    expect(store.activeShape.level).toBe(1) // редактировать невидимое нельзя
  })

  it('«Добавить ярус» заводит следующий уровень с перепадом', () => {
    threeLevels()
    store.addLevel()
    expect(store.activeShape.level).toBe(4)
    expect(store.activeShape.drop).toBe(300)
    expect(store.tool).toBe('draw') // сразу рисуем контур нового яруса
  })
})

describe('разбивка с вырезом', () => {
  function roomWithColumn() {
    store.reset('empty')
    const ceiling = drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const hole = drawShape([{ x: 1500, y: 1200 }, { x: 2500, y: 1200 }, { x: 2500, y: 1800 }, { x: 1500, y: 1800 }])
    store.setShapeKind(hole, 'hole')
    store.setActiveShape(ceiling)
    return { ceiling, hole }
  }

  it('треугольники опираются на углы выреза', () => {
    const { hole } = roomWithColumn()
    expect(store.triangulateActive()).toBeNull()

    const holeIds = new Set(store.shapes.find((s) => s.id === hole)!.points.map((p) => p.id))
    const used = new Set(store.activeShape.triangles.flatMap((t) => [t.a, t.b, t.c]))
    for (const id of holeIds) {
      expect(used.has(id), 'угол выреза не попал ни в один треугольник').toBe(true)
    }
  })

  it('сумма треугольников равна площади полотна за вычетом выреза', () => {
    roomWithColumn()
    store.triangulateActive()
    // 12 м² минус колонна 1×0.6
    expect(store.activeChordAreaM2).toBeCloseTo(12 - 0.6, 3)
    expect(store.triangleAreaM2).toBeCloseTo(12 - 0.6, 2)
    expect(store.triangleAreaM2).toBeCloseTo(store.activeChordAreaM2, 2)
  })

  it('ни один треугольник не накрывает вырез', () => {
    const { hole } = roomWithColumn()
    store.triangulateActive()
    const centre = { x: 2000, y: 1500 } // середина колонны
    const pts = new Map(store.allPoints.map((p) => [p.id, p]))
    for (const t of store.activeShape.triangles) {
      const [a, b, c] = [t.a, t.b, t.c].map((id) => pts.get(id)!)
      const s = Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
      const side = (p: typeof a, q: typeof a) =>
        Math.sign((q.x - p.x) * (centre.y - p.y) - (q.y - p.y) * (centre.x - p.x))
      const inside = side(a, b) === s && side(b, c) === s && side(c, a) === s
      expect(inside, 'треугольник прошёл сквозь вырез').toBe(false)
    }
    expect(hole).toBeTruthy()
  })

  it('обвод выреза в листе замера помечен как контур', () => {
    roomWithColumn()
    store.triangulateActive()
    const rows = store.measureRows
    const holeRows = rows.filter((r) => r.side.includes('H'))
    expect(holeRows.length).toBeGreaterThan(0)
    expect(holeRows.some((r) => r.kind === 'contour')).toBe(true)
  })

  it('пристройка треугольников к полотну с вырезом отклоняется понятно', () => {
    roomWithColumn()
    store.triangulateActive()
    const e = store.activeEdges[0]
    expect(store.attachTriangle(e.key, 2000, 2000)).toMatch(/вырез/)
  })
})

describe('выбор фигуры по площади', () => {
  it('под курсором выигрывает самая мелкая фигура', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const inner = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeLevel(inner, 2, 100)

    const view = store.shapesView
    expect(view.map((s) => s.areaMm)).toEqual([12_000_000, 2_000_000])
    // точка (2000,1500) лежит в обеих фигурах — выбрать надо вложенную
    const hits = view.filter((s) => s.areaMm > 0)
    const smallest = hits.reduce((a, b) => (a.areaMm <= b.areaMm ? a : b))
    expect(smallest.id).toBe(inner)
  })
})

/**
 * Два полотна не могут занимать одно место. Поэтому любой контур, нарисованный
 * внутри потолка, вырезает в нём отверстие — помечен он «Вырезом» или это
 * просто полотно другого яруса.
 */
describe('вложенные контуры', () => {
  function nested() {
    store.reset('empty')
    const outer = drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const inner = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    return { outer, inner }
  }

  it('вложенное полотно вырезает родителя без пометки «Вырез»', () => {
    const { outer, inner } = nested()
    expect(store.shapes.find((s) => s.id === inner)!.kind).toBe('ceiling')
    store.setActiveShape(outer)
    expect(store.activeAreaM2).toBeCloseTo(12 - 2, 3) // верхнее полотно с дыркой
    expect(store.area / 1e6).toBeCloseTo(12, 3) // всего полотна: 10 + 2
  })

  it('его вершины входят в разбивку родителя', () => {
    const { outer, inner } = nested()
    store.setActiveShape(outer)
    expect(store.triangulateActive()).toBeNull()

    const innerIds = store.shapes.find((s) => s.id === inner)!.points.map((p) => p.id)
    const used = new Set(store.activeShape.triangles.flatMap((t) => [t.a, t.b, t.c]))
    for (const id of innerIds) {
      expect(used.has(id), 'угол вложенной фигуры не попал в разбивку').toBe(true)
    }
    expect(store.triangleAreaM2).toBeCloseTo(12 - 2, 2)
  })

  it('проём и ярус в нём не вычитаются дважды', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    const opening = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeKind(opening, 'hole')
    const lower = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setShapeLevel(lower, 2, 150)

    expect(store.levelStats[0].areaM2).toBeCloseTo(10, 3) // 12 минус проём, один раз
    expect(store.levelStats[1].areaM2).toBeCloseTo(2, 3)
  })

  it('вложенность считается по геометрии, ярус на неё не влияет', () => {
    const { outer, inner } = nested()
    store.setShapeLevel(inner, 5, 400)
    store.setActiveShape(outer)
    expect(store.activeAreaM2).toBeCloseTo(10, 3) // всё равно вырезает
  })
})

/**
 * Разбивка не пересчитывается сама. Если фигуру нарисовали внутри уже
 * размеченного полотна, сетка про неё не знает и идёт сквозь — это должно
 * быть видно, а пересобрать её должно быть чем.
 */
describe('устаревшая разбивка', () => {
  function outerThenInner() {
    store.reset('empty')
    const outer = drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])
    store.triangulateActive()
    const inner = drawShape([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }])
    store.setActiveShape(outer)
    return { outer, inner }
  }

  it('замечает, что сетка не знает про вложенную фигуру', () => {
    const { inner } = outerThenInner()
    expect(store.meshStale).toBe(true)

    const innerIds = store.shapes.find((s) => s.id === inner)!.points.map((p) => p.id)
    const used = new Set(store.activeShape.triangles.flatMap((t) => [t.a, t.b, t.c]))
    expect(innerIds.every((id) => !used.has(id))).toBe(true) // именно этого и не хватало
    expect(store.triangleAreaM2).not.toBeCloseTo(store.activeChordAreaM2, 2)
  })

  it('после пересборки углы вложенной фигуры входят в сетку', () => {
    const { inner } = outerThenInner()
    store.clearTriangles()
    expect(store.triangulateActive()).toBeNull()

    expect(store.meshStale).toBe(false)
    const innerIds = store.shapes.find((s) => s.id === inner)!.points.map((p) => p.id)
    const used = new Set(store.activeShape.triangles.flatMap((t) => [t.a, t.b, t.c]))
    expect(innerIds.every((id) => used.has(id))).toBe(true)
    expect(store.triangleAreaM2).toBeCloseTo(store.activeChordAreaM2, 2)
  })

  it('замечает и удалённые вершины', () => {
    store.reset('empty')
    drawShape([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }])
    store.triangulateActive()
    expect(store.meshStale).toBe(false)
    store.selectPoint(store.activeShape.points[3].id)
    store.deleteSelected() // правка контура сбрасывает разбивку целиком
    expect(store.activeShape.triangles).toHaveLength(0)
    expect(store.meshStale).toBe(false)
  })
})

describe('врезка угла в сторону', () => {
  it('без указания места ставит угол ровно в середину', () => {
    store.reset('rect')
    const e = store.activeEdges[0]
    const id = store.insertOnEdge(e.key)
    const p = store.activeShape.points.find((x) => x.id === id)!
    expect(p.x).toBe(Math.round((e.a.x + e.b.x) / 2))
    expect(p.y).toBe(Math.round((e.a.y + e.b.y) / 2))
  })

  it('с указанием места ставит угол туда, где ручка под курсором', () => {
    store.reset('rect')
    const e = store.activeEdges[0]
    const at = { x: e.a.x + (e.b.x - e.a.x) * 0.75, y: e.a.y + (e.b.y - e.a.y) * 0.75 }
    const id = store.insertOnEdge(e.key, at)
    const p = store.activeShape.points.find((x) => x.id === id)!
    expect(p.x).toBe(Math.round(at.x))
    expect(p.y).toBe(Math.round(at.y))
    expect(store.activeShape.points).toHaveLength(5)
  })
})
