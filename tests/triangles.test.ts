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
 * Замер по треугольникам: замерщик диктует только длины, углы не меряются.
 * Проверяем, что контур восстанавливается точно и что программа не даёт
 * построить невозможное или наложить треугольники друг на друга.
 */
describe('метод треугольников', () => {
  it('строит комнату 4000×3000 из двух треугольников', () => {
    store.reset('empty')
    expect(store.startTriangleShape(4000, 3000, 5000)).toBeNull()
    expect(store.activeShape.points).toHaveLength(3)
    expect(store.activeShape.closed).toBe(true)
    expect(store.area / 1e6).toBeCloseTo(6, 3)

    const hyp = store.activeEdges.find((e) => Math.abs(e.length - 5000) < 1)!
    expect(hyp).toBeDefined()
    expect(store.attachTriangle(hyp.key, 3000, 4000)).toBeNull()

    expect(store.activeShape.points).toHaveLength(4)
    expect(store.activeShape.triangles).toHaveLength(2)
    expect(store.area / 1e6).toBeCloseTo(12, 3)
    expect(store.perimeterMm).toBeCloseTo(14000, 0)
    expect(store.triangleAreaM2).toBeCloseTo(store.area / 1e6, 3)
  })

  it('не даёт наложить треугольники и построить невозможный', () => {
    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000)
    const hyp = store.activeEdges.find((e) => Math.abs(e.length - 5000) < 1)!
    store.attachTriangle(hyp.key, 3000, 4000)
    const points = store.activeShape.points.length

    // гипотенуза ушла внутрь фигуры — пристраивать к ней больше нельзя
    expect(store.attachTriangle(hyp.key, 3000, 4000)).toMatch(/внутри фигуры|внешним/)
    expect(store.activeShape.points).toHaveLength(points)

    const side = store.activeEdges[0]
    expect(store.attachTriangle(side.key, 10, 10)).toMatch(/не существует/)
    expect(store.attachTriangle(side.key, 100000, 1)).toMatch(/не существует/)
    expect(store.activeShape.points).toHaveLength(points)
  })

  it('разбивает нарисованную Г-образную фигуру на непересекающиеся треугольники', () => {
    store.reset('empty')
    store.insertLShape(4000, 3000, 1500, 1200)
    expect(store.triangulateActive()).toBeNull()
    expect(store.activeShape.triangles).toHaveLength(4) // 6 углов → 4 треугольника
    expect(store.triangleAreaM2).toBeCloseTo(store.area / 1e6, 3)

    const rows = store.measureRows
    expect(rows).toHaveLength(12) // 4 треугольника × 3 стороны
    expect(rows.filter((r) => r.kind === 'diagonal')).toHaveLength(6)
    expect(rows.every((r) => !r.side.includes('?'))).toBe(true)
  })

  it('строит цепочку треугольников и откатывает последний', () => {
    store.reset('empty')
    store.startTriangleShape(3000, 2500, 2500)
    let built = 0
    for (let i = 0; i < 3; i++) {
      const edges = store.activeEdges
      if (store.attachTriangle(edges[edges.length - 1].key, 2200, 2200) === null) built++
    }
    expect(built).toBe(3)
    expect(store.activeShape.closed).toBe(true)
    expect(store.activeShape.points).toHaveLength(6)

    store.removeLastTriangle()
    expect(store.activeShape.points).toHaveLength(5)
    expect(store.activeShape.triangles).toHaveLength(3)
  })

  /**
   * Самый частый способ замера: встать посреди комнаты и померить до каждого
   * угла. Точка замера остаётся внутри контура, а последний треугольник
   * замыкает круг, приваривая вершину к первой.
   */
  it('собирает квадрат замером из точки посреди комнаты', () => {
    store.reset('empty')
    const R = Math.hypot(2000, 2000) // 2828 мм до угла
    expect(store.startTriangleShape(4000, R, R)).toBeNull()

    const wall = store.activeEdges.find((e) => Math.abs(e.length - 4000) < 2)!
    const centerId = store.activeShape.points.find((p) => p.id !== wall.a.id && p.id !== wall.b.id)!.id
    let corner = wall.b.id
    let lastFresh: string | undefined

    for (let i = 1; i <= 3; i++) {
      const ray = store.activeEdges.find((e) =>
        (e.a.id === centerId && e.b.id === corner) || (e.b.id === centerId && e.a.id === corner))!
      expect(ray, `луч до угла ${i}`).toBeDefined()
      const before = new Set(store.allPoints.map((p) => p.id))
      const fromA = ray.a.id === centerId ? R : 4000
      const fromB = ray.a.id === centerId ? 4000 : R
      expect(store.attachTriangle(ray.key, fromA, fromB), `треугольник ${i}`).toBeNull()
      lastFresh = store.allPoints.find((p) => !before.has(p.id))?.id
      if (i < 3) corner = lastFresh!
    }

    expect(lastFresh, 'последний треугольник замкнул контур, не создав вершину').toBeUndefined()
    const sq = store.activeShape
    expect(sq.points).toHaveLength(4)
    expect(sq.innerPoints).toHaveLength(1)
    expect(sq.innerPoints[0].id).toBe(centerId)
    expect(sq.triangles).toHaveLength(4)
    expect(store.area / 1e6).toBeCloseTo(16, 1)
    expect(store.perimeterMm).toBeCloseTo(16000, -1)
    expect(store.allPoints).toHaveLength(5) // 4 угла + точка замера
    expect(store.trianglesView).toHaveLength(4)
    expect(store.measureRows.every((r) => !r.side.includes('?'))).toBe(true)
  })
})

/**
 * Веер из одной точки — только один из способов замера, и не всегда рабочий.
 * В П-образной комнате диагональ из любого угла к дальним углам выходит
 * наружу через проём — померить её нечем. Такую комнату мерят цепочкой:
 * каждый следующий треугольник пристраивают к любой внешней стороне уже
 * построенных, а не к сторонам одной вершины.
 */
describe('замер цепочкой, не веером', () => {
  // П-образная комната 6000×4000 с проёмом 2000×2500
  const room = [
    { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 4000, y: 4000 },
    { x: 4000, y: 1500 }, { x: 2000, y: 1500 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 },
  ]
  const d = (i: number, j: number) => Math.hypot(room[i].x - room[j].x, room[i].y - room[j].y)

  it('собирает П-образную комнату цепочкой треугольников', () => {
    store.reset('empty')

    // первый треугольник: стена 1-2 и две диагонали в вершину 5
    expect(store.startTriangleShape(d(0, 1), d(0, 4), d(1, 4))).toBeNull()

    // сопоставляем вершины комнаты с точками, которые создал конструктор
    const id = new Map<number, string>()
    {
      const pts = store.activeShape.points
      const near = (a: typeof pts[0], b: typeof pts[0]) => Math.hypot(a.x - b.x, a.y - b.y)
      for (const p of pts) {
        const others = pts.filter((q) => q.id !== p.id).map((q) => Math.round(near(p, q))).sort((x, y) => x - y)
        const match = [0, 1, 4].find((v) => {
          const want = [0, 1, 4].filter((w) => w !== v).map((w) => Math.round(d(v, w))).sort((x, y) => x - y)
          return want[0] === others[0] && want[1] === others[1]
        })
        expect(match, 'вершина первого треугольника опознана').toBeDefined()
        id.set(match!, p.id)
      }
    }

    /** Пристроить треугольник к стороне между уже известными вершинами. */
    function attach(u: number, v: number, fresh: number) {
      const e = store.activeEdges.find((x) =>
        (x.a.id === id.get(u) && x.b.id === id.get(v)) || (x.a.id === id.get(v) && x.b.id === id.get(u)))
      expect(e, `сторона ${u + 1}-${v + 1} доступна для пристройки`).toBeDefined()
      const aIsU = e!.a.id === id.get(u)
      const known = new Set(store.allPoints.map((p) => p.id))
      const err = store.attachTriangle(e!.key, d(aIsU ? u : v, fresh), d(aIsU ? v : u, fresh))
      expect(err, `треугольник на вершину ${fresh + 1}`).toBeNull()
      const added = store.allPoints.find((p) => !known.has(p.id))
      expect(added, 'появилась новая вершина').toBeDefined()
      id.set(fresh, added!.id)
    }

    // цепочка обходит комнату: правое крыло, потом левое
    attach(1, 4, 3) // сторона 2-5 → вершина 4
    attach(1, 3, 2) // сторона 2-4 → вершина 3
    attach(0, 4, 5) // сторона 1-5 → вершина 6
    attach(0, 5, 6) // сторона 1-6 → вершина 7
    attach(0, 6, 7) // сторона 1-7 → вершина 8

    const sh = store.activeShape
    expect(sh.points).toHaveLength(8)
    expect(sh.triangles).toHaveLength(6) // n-2 для восьмиугольника
    expect(sh.closed).toBe(true)
    expect(store.area / 1e6).toBeCloseTo(19, 1) // 6×4 минус проём 2×2.5
    expect(store.perimeterMm).toBeCloseTo(25000, -1)
    expect(store.triangleAreaM2).toBeCloseTo(store.area / 1e6, 1)

    // это именно цепочка: общей вершины у всех треугольников нет
    const common = sh.triangles
      .map((t) => new Set([t.a, t.b, t.c]))
      .reduce((acc, set) => new Set([...acc].filter((v) => set.has(v))))
    expect(common.size, 'все треугольники сходятся в одной точке — это веер').toBe(0)
  })
})

/**
 * Качество засечки. Вершину находят пересечением двух дуг: чем острее они
 * сходятся, тем сильнее ошибка рулетки растягивает точку вдоль «веретена».
 * Это и есть причина, по которой веер из одной точки на вытянутой комнате
 * даёт плохой результат — диагонали идут почти вдоль стены.
 */
describe('надёжность засечки', () => {
  it('считает ошибку по худшему углу треугольника', () => {
    store.reset('empty')
    // почти вырожденный треугольник: 6000 = 3500 + 2600 с малым запасом
    store.startTriangleShape(6000, 3500, 2600)
    const q = store.triangleQuality[0]
    expect(q.level).toBe('poor')
    expect(q.minAngle).toBeLessThan(20)
    expect(q.factor).toBeGreaterThan(2)

    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000) // египетский, углы 37/53/90
    expect(store.triangleQuality[0].level).toBe('good')
    expect(store.triangleQuality[0].minAngle).toBe(37)
    expect(store.triangleQuality[0].factor).toBeCloseTo(1.66, 1)
  })

  it('предупреждает о плохой засечке заранее, но строить не мешает', () => {
    store.reset('empty')
    store.startTriangleShape(4000, 3000, 5000)
    const base = store.activeEdges.find((e) => Math.abs(e.length - 4000) < 1)!

    // засечка почти вдоль стены: 2010 + 2010 против основания 4000 — дуги сходятся под 11°
    store.previewTriangle(base.key, 2010, 2010)
    expect(store.triPreview!.ok).toBe(true)
    expect(store.triPreview!.level).toBe('poor')
    expect(store.triPreview!.msg).toMatch(/Засечка всего/)

    // но это данные замерщика — запрещать их нельзя
    expect(store.attachTriangle(base.key, 2010, 2010)).toBeNull()
    expect(store.activeShape.triangles).toHaveLength(2)

    // хорошая засечка отмечается как надёжная
    const good = store.activeEdges.find((e) => Math.abs(e.length - 5000) < 1)!
    store.previewTriangle(good.key, 4000, 3000)
    expect(store.triPreview!.level).toBe('good')
    expect(store.triPreview!.msg).toMatch(/надёжно/)
  })
})

/**
 * Автоматическая разбивка не должна сводить все диагонали в одну вершину.
 * Веер на вытянутой комнате даёт длинные узкие треугольники: замерщику
 * пришлось бы тянуть рулетку через всю комнату почти вдоль стены.
 */
describe('качество автоматической разбивки', () => {
  // вытянутая комната 6000×2000 со скошенными углами и лишними точками на стене
  const room = [
    { x: 400, y: 0 }, { x: 2000, y: 0 }, { x: 3000, y: 0 }, { x: 5600, y: 0 },
    { x: 6000, y: 400 }, { x: 6000, y: 1600 },
    { x: 5600, y: 2000 }, { x: 400, y: 2000 },
    { x: 0, y: 1600 }, { x: 0, y: 400 },
  ]
  const minAngle = (a: typeof room[0], b: typeof room[0], c: typeof room[0]) => {
    const L = (p: typeof room[0], q: typeof room[0]) => Math.hypot(p.x - q.x, p.y - q.y)
    const ang = (o: number, p: number, q: number) =>
      (Math.acos(Math.max(-1, Math.min(1, (p * p + q * q - o * o) / (2 * p * q)))) * 180) / Math.PI
    const [x, y, z] = [L(a, b), L(b, c), L(c, a)]
    return Math.min(ang(x, y, z), ang(y, x, z), ang(z, x, y))
  }

  function buildRoom() {
    store.reset('empty')
    store.setTool('draw')
    for (const p of room) store.drawPoint(p.x, p.y, false)
    store.finishDraw(true)
    expect(store.triangulateActive()).toBeNull()
  }

  it('не сводит все треугольники в одну вершину', () => {
    buildRoom()
    const tris = store.activeShape.triangles
    expect(tris).toHaveLength(room.length - 2)

    const common = tris
      .map((t) => new Set([t.a, t.b, t.c]))
      .reduce((acc, set) => new Set([...acc].filter((v) => set.has(v))))
    expect(common.size, 'все треугольники сошлись в одной точке — это веер').toBe(0)

    // и ни одна вершина не собирает на себя больше половины треугольников
    const degree = new Map<string, number>()
    for (const t of tris) for (const v of [t.a, t.b, t.c]) degree.set(v, (degree.get(v) ?? 0) + 1)
    // ни одна вершина не собирает больше двух третей треугольников
    expect(Math.max(...degree.values())).toBeLessThanOrEqual(Math.floor((tris.length * 2) / 3))
  })

  it('даёт треугольники заметно толще, чем веер из одного угла', () => {
    buildRoom()
    const ours = Math.min(...store.triangleQuality.map((q) => q.minAngle))

    // тот же контур, разбитый веером из вершины 0 — как делала наивная разбивка
    const fan = Math.min(...room.slice(1, -1).map((_, i) => minAngle(room[0], room[i + 1], room[i + 2])))

    expect(fan).toBeLessThan(10) // веер тут вырождается
    expect(ours, `наша разбивка ${ours}° против веера ${fan.toFixed(1)}°`).toBeGreaterThan(fan * 2.5)
    // 14° в скошенном углу неизбежны: там сама комната узкая. Важно, что
    // узкими остались только углы, а не треугольники через всю комнату.
    expect(ours).toBeGreaterThanOrEqual(12)
  })

  it('площадь и лист замера остаются согласованными', () => {
    buildRoom()
    expect(store.triangleAreaM2).toBeCloseTo(store.area / 1e6, 2)
    expect(store.area / 1e6).toBeCloseTo(11.68, 2)
    expect(store.measureRows.every((r) => !r.side.includes('?'))).toBe(true)
  })
})

/** Сколько рулетки придётся вытянуть замерщику — главный практический критерий. */
describe('длина диагоналей замера', () => {
  const room = [
    { x: 400, y: 0 }, { x: 2000, y: 0 }, { x: 3000, y: 0 }, { x: 5600, y: 0 },
    { x: 6000, y: 400 }, { x: 6000, y: 1600 },
    { x: 5600, y: 2000 }, { x: 400, y: 2000 },
    { x: 0, y: 1600 }, { x: 0, y: 400 },
  ]

  it('короче, чем у веера из одного угла, почти вдвое', () => {
    store.reset('empty')
    store.setTool('draw')
    for (const p of room) store.drawPoint(p.x, p.y, false)
    store.finishDraw(true)
    store.triangulateActive()

    const sh = store.activeShape
    const byId = new Map(sh.points.map((p) => [p.id, p]))
    const len = (u: string, v: string) => {
      const a = byId.get(u)!; const b = byId.get(v)!
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const key = (u: string, v: string) => [u, v].sort().join('|')

    const contour = new Set<string>()
    for (let i = 0; i < sh.points.length; i++) {
      contour.add(key(sh.points[i].id, sh.points[(i + 1) % sh.points.length].id))
    }
    const diagonals = new Set<string>()
    for (const t of sh.triangles) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        if (!contour.has(key(u, v))) diagonals.add(key(u, v))
      }
    }
    const ours = [...diagonals].reduce((s, k) => s + len(k.split('|')[0], k.split('|')[1]), 0)

    // веер из первой вершины — столько же диагоналей, но через всю комнату
    let fan = 0
    for (let i = 2; i < sh.points.length - 1; i++) fan += len(sh.points[0].id, sh.points[i].id)

    expect(diagonals.size).toBe(sh.points.length - 3)
    expect(ours, `наши ${Math.round(ours)} мм против ${Math.round(fan)} мм у веера`).toBeLessThan(fan * 0.7)
  })
})

/** Сумму треугольников сверяют с активной фигурой, а не со всем чертежом. */
describe('контроль площади', () => {
  it('не путает площадь активной фигуры с суммой по всем', () => {
    store.reset('rect') // прямоугольник 3000×2000 = 6 м²
    store.startTriangleShape(4000, 3000, 5000) // вторая фигура — треугольник 6 м²
    expect(store.shapes).toHaveLength(2)

    expect(store.area / 1e6).toBeCloseTo(12, 2) // сумма по чертежу
    expect(store.activeAreaM2).toBeCloseTo(6, 2) // только активная фигура
    expect(store.triangleAreaM2).toBeCloseTo(store.activeAreaM2, 3)
  })
})

/**
 * Врезанный в прямую стену угол оставляет три точки на одной линии. Ear
 * clipping из них ухо не построит, и разбивка падала с «самопересечением».
 */
describe('вершины на прямой стене', () => {
  it('разбивка переживает угол, врезанный в середину стены', () => {
    store.reset('empty')
    store.insertRectangle(4000, 3000)
    const e = store.activeEdges[0]
    store.insertOnEdge(e.key)
    expect(store.activeShape.points).toHaveLength(5)

    expect(store.triangulateActive(), 'плоская вершина не должна ломать разбивку').toBeNull()
    expect(store.activeShape.triangles.length).toBeGreaterThan(0)
    expect(store.triangleAreaM2).toBeCloseTo(12, 2)
  })

  it('и несколько подряд тоже', () => {
    store.reset('empty')
    store.insertRectangle(6000, 3000)
    for (let i = 0; i < 3; i++) {
      const e = store.activeEdges.find((x) => Math.abs(x.a.y - x.b.y) < 1 && x.a.y === 0)!
      store.insertOnEdge(e.key)
    }
    expect(store.activeShape.points.length).toBeGreaterThan(6)
    expect(store.triangulateActive()).toBeNull()
    expect(store.triangleAreaM2).toBeCloseTo(18, 2)
  })
})
