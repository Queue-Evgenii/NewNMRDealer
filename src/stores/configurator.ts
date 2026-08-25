import { defineStore } from 'pinia'
import type {
  Point, Edge, EdgeProps, Shape, Triangle, Settings, Order, Pricing, CostBreakdown, SerializedModel,
} from '../types'
import {
  edgeKey,
  polygonArea,
  perimeter,
  diagonals,
  shrink,
  centroid,
  newId,
  snapValue,
} from '../composables/useGeometry'
import {
  apexAngleDeg,
  apexFrom,
  boundaryLoop,
  cross3,
  earClip,
  heronArea,
  orientTri,
  pointInTri,
  signedArea2,
  triangleError,
  trianglesOverlap,
  triangleAngles,
  errorFactor,
  quality,
  WELD_TOL,
  type Quality,
  type XY,
} from '../composables/useTriangulation'

/**
 * Режимы работы. Каждый режим — своё поведение холста и своя панель справа;
 * скрытых подрежимов нет. Панорама и зум работают во всех режимах одинаково.
 */
export type Tool = 'select' | 'draw' | 'ruler' | 'measure'

const TOOLS: Tool[] = ['select', 'draw', 'ruler', 'measure']

/** Предпросмотр пристраиваемого треугольника (не сохраняется). */
export interface TriPreview {
  a: XY
  b: XY
  c: XY
  ok: boolean
  msg: string
  /** Качество засечки: под каким углом сходятся две рулетки. */
  level?: Quality
}

interface State {
  shapes: Shape[]
  activeShapeId: string
  selectedPointId: string | null
  selectedEdgeKey: string | null
  settings: Settings
  order: Order
  pricing: Pricing
  tool: Tool
  /** Контур, который сейчас рисуют (режим «Рисовать»). */
  drawShapeId: string | null
  /** Сторона-основание для следующего треугольника — живёт отдельно от выделения. */
  measureBaseKey: string | null
  triPreview: TriPreview | null
  past: string[]
  future: string[]
}

const STORAGE_KEY = 'nmr.configurator.v2'
const HISTORY_LIMIT = 100

function defaultSettings(): Settings {
  return { gridStep: 100, showGrid: true, showMeasures: true, showTriangles: true, snap: true, usad: 7, pxPerMm: 0.18 }
}
function defaultOrder(): Order {
  return { client: '', film: 'Глянец', color: 'Белый', currency: 'PLN' }
}
function defaultPricing(): Pricing {
  return { filmPerM2: 45, garpunPerM: 6, seamPerM: 12, workPerM2: 20 }
}

function makeShape(points: Point[], closed: boolean): Shape {
  return { id: newId(), points, closed, edgeProps: {}, triangles: [], innerPoints: [], measureDirty: false }
}
/** Все вершины фигуры: контур + внутренние точки замера. */
function shapePoints(shape: Shape): Point[] {
  return shape.innerPoints.length ? [...shape.points, ...shape.innerPoints] : shape.points
}
function pointIndex(shape: Shape): Map<string, Point> {
  return new Map(shapePoints(shape).map((p) => [p.id, p]))
}
function rectPoints(w = 3000, h = 2000, ox = 0, oy = 0): Point[] {
  return [
    { id: newId(), x: ox, y: oy },
    { id: newId(), x: ox + w, y: oy },
    { id: newId(), x: ox + w, y: oy + h },
    { id: newId(), x: ox, y: oy + h },
  ]
}

function shapeEdges(shape: Shape): Edge[] {
  const n = shape.points.length
  if (n < 2) return []
  const out: Edge[] = []
  const last = shape.closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const a = shape.points[i]
    const b = shape.points[(i + 1) % n]
    const key = edgeKey(a.id, b.id)
    out.push({
      key, shapeId: shape.id, a, b,
      length: Math.hypot(a.x - b.x, a.y - b.y),
      props: shape.edgeProps[key] ?? { garpun: true, seam: false },
    })
  }
  return out
}

export const useConfigurator = defineStore('configurator', {
  state: (): State => {
    const s = makeShape(rectPoints(), true)
    return {
      shapes: [s],
      activeShapeId: s.id,
      selectedPointId: null,
      selectedEdgeKey: null,
      settings: defaultSettings(),
      order: defaultOrder(),
      pricing: defaultPricing(),
      tool: 'select',
      drawShapeId: null,
      measureBaseKey: null,
      triPreview: null,
      past: [],
      future: [],
    }
  },

  getters: {
    activeShape(state): Shape {
      return state.shapes.find((s) => s.id === state.activeShapeId) ?? state.shapes[0]
    },
    // all vertices across every shape (for rendering / snapping)
    allPoints(state): Point[] {
      return state.shapes.flatMap((s) => shapePoints(s))
    },
    // per-shape render info
    shapesView(state) {
      return state.shapes.map((s) => ({
        id: s.id,
        closed: s.closed,
        active: s.id === state.activeShapeId,
        points: s.points,
        inner: s.innerPoints,
        shrunk: s.closed ? shrink(s.points, state.settings.usad) : [],
      }))
    },
    edges(state): Edge[] {
      return state.shapes.flatMap((s) => shapeEdges(s))
    },
    area(state): number {
      return state.shapes.reduce((sum, s) => sum + (s.closed ? polygonArea(s.points) : 0), 0)
    },
    perimeterMm(state): number {
      return state.shapes.reduce((sum, s) => sum + perimeter(s.points, s.closed), 0)
    },
    diagonalList(): { fromId: string; toId: string; length: number }[] {
      const s = this.activeShape as Shape
      return s && s.closed ? diagonals(s.points) : []
    },
    angles(state): { id: string; deg: number; cx: number; cy: number }[] {
      const out: { id: string; deg: number; cx: number; cy: number }[] = []
      for (const s of state.shapes) {
        const n = s.points.length
        if (n < 3 || !s.closed) continue
        const c = centroid(s.points)
        // знак обхода нужен, чтобы отличить вогнутый угол: 270°, а не 90°
        const turn = signedArea2(s.points) >= 0 ? 1 : -1
        for (let i = 0; i < n; i++) {
          const prev = s.points[(i - 1 + n) % n]
          const cur = s.points[i]
          const next = s.points[(i + 1) % n]
          const v1x = prev.x - cur.x, v1y = prev.y - cur.y
          const v2x = next.x - cur.x, v2y = next.y - cur.y
          const dot = v1x * v2x + v1y * v2y
          const crs = v1x * v2y - v1y * v2x
          const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y)
          let deg = m1 && m2 ? (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180) / Math.PI : 0
          if (turn * crs > 0) deg = 360 - deg
          out.push({ id: cur.id, deg: Math.round(deg), cx: c.x, cy: c.y })
        }
      }
      return out
    },
    garpunLength(): number {
      return (this.edges as Edge[]).filter((e) => e.props.garpun).reduce((s, e) => s + e.length, 0)
    },
    seamLength(): number {
      return (this.edges as Edge[]).filter((e) => e.props.seam).reduce((s, e) => s + e.length, 0)
    },
    /** total cut (usad) area across shapes, m² */
    cutAreaM2(state): number {
      let mm = 0
      for (const s of state.shapes) {
        if (s.closed) mm += polygonArea(shrink(s.points, state.settings.usad))
      }
      return mm / 1_000_000
    },
    /** Стороны активной фигуры с номерами вершин — база для замера. */
    activeEdges(): (Edge & { i1: number; i2: number })[] {
      const s = this.activeShape as Shape
      return shapeEdges(s).map((e) => ({
        ...e,
        i1: s.points.findIndex((p) => p.id === e.a.id) + 1,
        i2: s.points.findIndex((p) => p.id === e.b.id) + 1,
      }))
    },
    /** Треугольники всех фигур для отрисовки на чертеже. */
    trianglesView(state) {
      const out: {
        id: string; shapeId: string; no: number; active: boolean
        pts: Point[]; cx: number; cy: number
        inner: { key: string; a: Point; b: Point }[]
      }[] = []
      for (const s of state.shapes) {
        const byId = pointIndex(s)
        const contour = new Set<string>()
        const n = s.points.length
        if (s.closed) for (let i = 0; i < n; i++) contour.add(edgeKey(s.points[i].id, s.points[(i + 1) % n].id))
        s.triangles.forEach((t, i) => {
          const a = byId.get(t.a); const b = byId.get(t.b); const c = byId.get(t.c)
          if (!a || !b || !c) return
          const inner = ([[a, b], [b, c], [c, a]] as [Point, Point][])
            .map(([u, v]) => ({ key: edgeKey(u.id, v.id), a: u, b: v }))
            .filter((e) => !contour.has(e.key))
          out.push({
            id: t.id, shapeId: s.id, no: i + 1, active: s.id === state.activeShapeId,
            pts: [a, b, c], cx: (a.x + b.x + c.x) / 3, cy: (a.y + b.y + c.y) / 3, inner,
          })
        })
      }
      return out
    },
    /** Таблица замера активной фигуры: по три стороны на треугольник. */
    measureRows(): { no: number; side: string; len: number; kind: 'Контур' | 'Диагональ'; area: number }[] {
      const s = this.activeShape as Shape
      const byId = pointIndex(s)
      const num = new Map(shapePoints(s).map((p, i) => [p.id, i + 1]))
      const contour = new Set<string>()
      const n = s.points.length
      if (s.closed) for (let i = 0; i < n; i++) contour.add(edgeKey(s.points[i].id, s.points[(i + 1) % n].id))
      const rows: { no: number; side: string; len: number; kind: 'Контур' | 'Диагональ'; area: number }[] = []
      s.triangles.forEach((t, i) => {
        const ids: [string, string][] = [[t.a, t.b], [t.b, t.c], [t.c, t.a]]
        const lens = ids.map(([u, v]) => {
          const A = byId.get(u); const B = byId.get(v)
          return A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 0
        })
        const area = heronArea(lens[0], lens[1], lens[2])
        ids.forEach(([u, v], k) => {
          rows.push({
            no: i + 1,
            side: (num.get(u) ?? '?') + '–' + (num.get(v) ?? '?'),
            len: Math.round(lens[k]),
            kind: contour.has(edgeKey(u, v)) ? 'Контур' : 'Диагональ',
            area,
          })
        })
      })
      return rows
    },
    /**
     * Надёжность каждого треугольника: узкий треугольник — плохая засечка,
     * ошибка рулетки в нём умножается. Считаем по худшему углу.
     */
    triangleQuality(): { no: number; minAngle: number; factor: number; level: Quality }[] {
      const byNo = new Map<number, number[]>()
      for (const r of this.measureRows as { no: number; len: number }[]) {
        const arr = byNo.get(r.no) ?? []
        arr.push(r.len)
        byNo.set(r.no, arr)
      }
      const out: { no: number; minAngle: number; factor: number; level: Quality }[] = []
      for (const [no, lens] of byNo) {
        if (lens.length !== 3) continue
        const minAngle = Math.min(...triangleAngles(lens[0], lens[1], lens[2]))
        out.push({ no, minAngle: Math.round(minAngle), factor: errorFactor(minAngle), level: quality(minAngle) })
      }
      return out.sort((a, b) => a.no - b.no)
    },
    /**
     * Площадь активной фигуры, м². Именно с ней сверяют сумму треугольников:
     * общая площадь по всем фигурам для контроля замера не годится.
     */
    activeAreaM2(): number {
      const s = this.activeShape as Shape
      return s && s.closed ? polygonArea(s.points) / 1_000_000 : 0
    },
    /** Суммарная площадь по треугольникам, м² — контрольная цифра замера. */
    triangleAreaM2(): number {
      const rows = this.measureRows as { no: number; area: number }[]
      const seen = new Set<number>()
      let mm2 = 0
      for (const r of rows) if (!seen.has(r.no)) { seen.add(r.no); mm2 += r.area }
      return mm2 / 1_000_000
    },
    selectedPoint(state): Point | null {
      for (const s of state.shapes) {
        const p = shapePoints(s).find((q) => q.id === state.selectedPointId)
        if (p) return p
      }
      return null
    },
    cost(state): CostBreakdown {
      const m2 = (this.area as number) / 1_000_000
      const garpunM = (this.garpunLength as number) / 1000
      const seamM = (this.seamLength as number) / 1000
      const film = m2 * state.pricing.filmPerM2
      const garpun = garpunM * state.pricing.garpunPerM
      const seam = seamM * state.pricing.seamPerM
      const work = m2 * state.pricing.workPerM2
      return { film, garpun, seam, work, total: film + garpun + seam + work }
    },
  },

  actions: {
    // ---- internals -----------------------------------------------------
    _active(): Shape {
      return this.shapes.find((s) => s.id === this.activeShapeId) ?? this.shapes[0]
    },
    _shapeOfPoint(id: string): Shape | undefined {
      return this.shapes.find((s) => shapePoints(s).some((p) => p.id === id))
    },
    _shapeOfEdge(key: string): Shape | undefined {
      return this.shapes.find((s) => shapeEdges(s).some((e) => e.key === key))
    },
    snapshot() {
      this.past.push(this.serialize())
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
    },
    /** Шаг сетки применяется по флагу «Привязка», видимость сетки ни при чём. */
    maybeSnap(v: number): number {
      return this.settings.snap ? snapValue(v, this.settings.gridStep) : Math.round(v)
    },
    /** Явная запись в localStorage — вызывается по окончании жеста. */
    commit() { this.persist() },

    // ---- editing (acts on the active shape) ----------------------------
    addPoint(x: number, y: number, afterId?: string, doSnap = true) {
      this.snapshot()
      const p: Point = { id: newId(), x: doSnap ? this.maybeSnap(x) : Math.round(x), y: doSnap ? this.maybeSnap(y) : Math.round(y) }
      const shape = afterId ? this._shapeOfPoint(afterId) ?? this._active() : this._active()
      if (afterId) {
        const idx = shape.points.findIndex((q) => q.id === afterId)
        shape.points.splice(idx + 1, 0, p)
      } else {
        shape.points.push(p)
      }
      this._invalidateTriangles(shape)
      this.activeShapeId = shape.id
      this.selectedPointId = p.id
      this.persist()
    },

    /** Старое имя — оставлено для панелей: начать рисовать новый контур. */
    beginNewShape() { this.beginDraw() },

    /** Begin a brand-new independent shape with its first point. */
    startShape(x: number, y: number, doSnap = true) {
      this.snapshot()
      const p: Point = { id: newId(), x: doSnap ? this.maybeSnap(x) : Math.round(x), y: doSnap ? this.maybeSnap(y) : Math.round(y) }
      const shape = makeShape([p], false)
      this.shapes.push(shape)
      this.activeShapeId = shape.id
      this.selectedPointId = p.id
      this.persist()
    },

    movePoint(id: string, x: number, y: number, record = true, doSnap = true) {
      const shape = this._shapeOfPoint(id)
      const p = shape ? shapePoints(shape).find((q) => q.id === id) : undefined
      if (!p) return
      if (record) this.snapshot()
      p.x = doSnap ? this.maybeSnap(x) : Math.round(x)
      p.y = doSnap ? this.maybeSnap(y) : Math.round(y)
      if (shape) this._touchMeasure(shape)
      if (record) this.persist()
    },

    /** Двигает фигуру целиком — замер при этом не портится. */
    moveShape(id: string, dx: number, dy: number, record = true) {
      const shape = this.shapes.find((s) => s.id === id)
      if (!shape) return
      if (record) this.snapshot()
      for (const p of shapePoints(shape)) {
        p.x = Math.round(p.x + dx)
        p.y = Math.round(p.y + dy)
      }
      if (record) this.persist()
    },

    /**
     * Сваривает перетащенную вершину с соседней: в конструкторе две точки
     * в одних координатах — это скрытая нулевая сторона, а не «совпали».
     */
    weldPoints(dragId: string, targetId: string): boolean {
      const shape = this._shapeOfPoint(dragId)
      if (!shape || dragId === targetId) return false
      if (!shape.points.some((p) => p.id === targetId)) return false // сварка только внутри фигуры
      if (shape.points.length <= (shape.closed ? 3 : 2)) return false
      const i = shape.points.findIndex((p) => p.id === dragId)
      const j = shape.points.findIndex((p) => p.id === targetId)
      if (i < 0 || j < 0) return false
      const n = shape.points.length
      const adjacent = Math.abs(i - j) === 1 || Math.abs(i - j) === n - 1
      if (!adjacent) return false // склейка несоседних вершин разорвала бы контур
      this.snapshot()
      shape.points = shape.points.filter((p) => p.id !== dragId)
      this._invalidateTriangles(shape)
      this.selectedPointId = targetId
      this.persist()
      return true
    },

    /** Врезает вершину в середину стороны — ручка на середине, а не «угадай клик». */
    insertOnEdge(key: string): string | null {
      const e = (this.edges as Edge[]).find((x) => x.key === key)
      if (!e) return null
      const shape = this.shapes.find((s) => s.id === e.shapeId)
      if (!shape) return null
      this.snapshot()
      const p: Point = { id: newId(), x: Math.round((e.a.x + e.b.x) / 2), y: Math.round((e.a.y + e.b.y) / 2) }
      const idx = shape.points.findIndex((q) => q.id === e.a.id)
      shape.points.splice(idx + 1, 0, p)
      this._invalidateTriangles(shape)
      this.activeShapeId = shape.id
      this.selectedPointId = p.id
      this.selectedEdgeKey = null
      this.persist()
      return p.id
    },

    setEdgeLength(key: string, lengthMm: number) {
      const e = (this.edges as Edge[]).find((ed) => ed.key === key)
      if (!e || lengthMm <= 0) return
      const shape = this._shapeOfPoint(e.b.id)
      if (!shape) return
      this.snapshot()
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y
      const cur = Math.hypot(dx, dy) || 1
      const target = shape.points.find((q) => q.id === e.b.id)
      if (target) {
        target.x = Math.round(e.a.x + (dx / cur) * lengthMm)
        target.y = Math.round(e.a.y + (dy / cur) * lengthMm)
      }
      this._touchMeasure(shape)
      this.persist()
    },

    deleteSelected() {
      // выделена сторона — убираем её, соединяя соседние углы
      if (!this.selectedPointId && this.selectedEdgeKey) {
        const e = (this.edges as Edge[]).find((x) => x.key === this.selectedEdgeKey)
        const sh = e ? this.shapes.find((x) => x.id === e.shapeId) : undefined
        if (!e || !sh || sh.points.length <= (sh.closed ? 3 : 2)) return
        this.snapshot()
        sh.points = sh.points.filter((p) => p.id !== e.b.id)
        this._invalidateTriangles(sh)
        this.selectedEdgeKey = null
        this.persist()
        return
      }
      const shape = this.selectedPointId ? this._shapeOfPoint(this.selectedPointId) : undefined
      if (!shape || !this.selectedPointId) return
      if (shape.innerPoints.some((p) => p.id === this.selectedPointId)) {
        // внутренняя точка замера существует только вместе с треугольниками
        this.snapshot()
        this._invalidateTriangles(shape)
        this.selectedPointId = null
        this.persist()
        return
      }
      const min = shape.closed ? 3 : 1
      if (shape.points.length <= min) {
        // removing the last meaningful point drops the whole shape (unless it's the only one)
        if (this.shapes.length > 1) {
          this.snapshot()
          this.shapes = this.shapes.filter((s) => s.id !== shape.id)
          this.activeShapeId = this.shapes[0].id
          this.selectedPointId = null
          this.persist()
        }
        return
      }
      this.snapshot()
      shape.points = shape.points.filter((p) => p.id !== this.selectedPointId)
      this._invalidateTriangles(shape)
      this.selectedPointId = null
      this.persist()
    },

    setEdgeProp(key: string, prop: keyof EdgeProps, value: boolean) {
      const shape = this._shapeOfEdge(key)
      if (!shape) return
      this.snapshot()
      const cur = shape.edgeProps[key] ?? { garpun: true, seam: false }
      shape.edgeProps[key] = { ...cur, [prop]: value }
      this.persist()
    },

    selectPoint(id: string | null) {
      this.selectedPointId = id
      this.selectedEdgeKey = null
      if (id) { const s = this._shapeOfPoint(id); if (s) this.activeShapeId = s.id }
    },
    selectEdge(key: string | null) {
      this.selectedEdgeKey = key
      this.selectedPointId = null
      if (key) { const s = this._shapeOfEdge(key); if (s) this.activeShapeId = s.id }
    },
    /** Смена режима. Выход из «Рисовать» всегда закрывает начатый контур. */
    setTool(tool: Tool) {
      if (this.tool === tool) return
      if (this.tool === 'draw' && this.drawShapeId) this.finishDraw(false)
      if (tool !== 'measure') { this.measureBaseKey = null; this.triPreview = null }
      this.tool = tool
      if (tool === 'draw') this.beginDraw()
    },
    /** Выделить фигуру целиком (без под-элементов). */
    selectShape(id: string) {
      this.activeShapeId = id
      this.selectedPointId = null
      this.selectedEdgeKey = null
    },
    clearSelection() {
      this.selectedPointId = null
      this.selectedEdgeKey = null
    },
    setActiveShape(id: string) { this.selectShape(id) },
    setMeasureBase(key: string | null) {
      this.measureBaseKey = key
      if (key) {
        const s = this._shapeOfEdge(key)
        if (s) this.activeShapeId = s.id
      } else {
        this.triPreview = null
      }
    },

    // ---- рисование контура ----------------------------------------------
    /** Начинает новый контур: точки добавляются только сюда. */
    beginDraw() {
      this.snapshot()
      this.shapes = this.shapes.filter((s) => s.points.length > 0)
      const shape = makeShape([], false)
      this.shapes.push(shape)
      this.drawShapeId = shape.id
      this.activeShapeId = shape.id
      this.clearSelection()
      this.tool = 'draw'
      this.persist()
    },
    /** Точка в рисуемый контур. Ни на что другое клик по холсту не влияет. */
    drawPoint(x: number, y: number, doSnap = true) {
      if (!this.drawShapeId) this.beginDraw()
      const shape = this.shapes.find((s) => s.id === this.drawShapeId)
      if (!shape) return
      this.snapshot()
      shape.points.push({
        id: newId(),
        x: doSnap ? this.maybeSnap(x) : Math.round(x),
        y: doSnap ? this.maybeSnap(y) : Math.round(y),
      })
      this.persist()
    },
    undoDrawPoint() {
      const shape = this.shapes.find((s) => s.id === this.drawShapeId)
      if (!shape || !shape.points.length) return
      this.snapshot()
      shape.points.pop()
      this.persist()
    },
    /** Завершает рисование: замкнуть или оставить как есть. Мусорные обрывки удаляются. */
    finishDraw(close: boolean) {
      const shape = this.shapes.find((s) => s.id === this.drawShapeId)
      this.drawShapeId = null
      if (!shape) return
      if (shape.points.length < 2 && this.shapes.length > 1) {
        this.shapes = this.shapes.filter((s) => s.id !== shape.id)
        this.activeShapeId = this.shapes[this.shapes.length - 1].id
      } else if (close && shape.points.length >= 3) {
        shape.closed = true
      }
      this.clearSelection()
      this.tool = 'select'
      this.persist()
    },

    /** Замкнуть/разомкнуть контур. Размыкание разрушает разбивку на треугольники. */
    toggleClosed() {
      this.snapshot()
      const s = this._active()
      s.closed = !s.closed
      if (!s.closed) this._invalidateTriangles(s)
      this.persist()
    },

    mirror(axis: 'h' | 'v') {
      this.snapshot()
      const s = this._active()
      const c = centroid(s.points)
      const flip = (p: Point): Point => ({
        id: p.id,
        x: axis === 'h' ? 2 * c.x - p.x : p.x,
        y: axis === 'v' ? 2 * c.y - p.y : p.y,
      })
      s.points = s.points.map(flip).reverse()
      s.innerPoints = s.innerPoints.map(flip)
      this.persist()
    },

    updateSettings(patch: Partial<Settings>) { this.settings = { ...this.settings, ...patch }; this.persist() },
    updateOrder(patch: Partial<Order>) { this.order = { ...this.order, ...patch }; this.persist() },
    updatePricing(patch: Partial<Pricing>) { this.pricing = { ...this.pricing, ...patch }; this.persist() },

    // ---- shape management ----------------------------------------------
    addRectangle(w: number, h: number) {
      this.snapshot()
      const b = this._bounds()
      const s = makeShape(rectPoints(w, h, b.right + 500, 0), true)
      this.shapes.push(s)
      this.activeShapeId = s.id
      this.selectedPointId = null
      this.persist()
    },
    /** clear everything and start from one shape (or empty for free drawing) */
    reset(kind: 'rect' | 'empty' = 'rect') {
      this.snapshot()
      const s = kind === 'rect' ? makeShape(rectPoints(), true) : makeShape([], false)
      this.shapes = [s]
      this.activeShapeId = s.id
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.persist()
    },
    insertRectangle(w: number, h: number) {
      this.snapshot()
      const s = makeShape(rectPoints(w, h), true)
      this.shapes = [s]
      this.activeShapeId = s.id
      this.selectedPointId = null
      this.persist()
    },
    insertLShape(w: number, h: number, cw: number, ch: number) {
      this.snapshot()
      const pts: Point[] = [
        { id: newId(), x: 0, y: 0 },
        { id: newId(), x: w, y: 0 },
        { id: newId(), x: w, y: h - ch },
        { id: newId(), x: w - cw, y: h - ch },
        { id: newId(), x: w - cw, y: h },
        { id: newId(), x: 0, y: h },
      ]
      const s = makeShape(pts, true)
      this.shapes = [s]
      this.activeShapeId = s.id
      this.selectedPointId = null
      this.persist()
    },
    deleteActiveShape() {
      if (this.shapes.length <= 1) return
      this.snapshot()
      this.shapes = this.shapes.filter((s) => s.id !== this.activeShapeId)
      this.activeShapeId = this.shapes[0].id
      this.selectedPointId = null
      this.persist()
    },
    _bounds() {
      let right = 0
      for (const s of this.shapes) for (const p of s.points) right = Math.max(right, p.x)
      return { right }
    },

    // ---- метод треугольников -------------------------------------------
    /** Размеры двигали руками — лист замера больше не совпадает с продиктованным. */
    _touchMeasure(shape: Shape) {
      if (shape.triangles.length) shape.measureDirty = true
    },
    /** Правка контура ломает разбивку — сбрасываем её. */
    _invalidateTriangles(shape: Shape) {
      if (shape.triangles.length) shape.triangles = []
      if (shape.innerPoints.length) shape.innerPoints = []
      shape.measureDirty = false
    },

    /** Пересобирает контур фигуры как границу её сетки треугольников. */
    _rebuildContour(shape: Shape): boolean {
      const byId = pointIndex(shape)
      shape.triangles = shape.triangles.map((t) => orientTri(t, (id) => byId.get(id)))
      const loop = boundaryLoop(shape.triangles)
      if (!loop) return false
      const pts = loop.map((id) => byId.get(id)).filter(Boolean) as Point[]
      if (pts.length !== loop.length) return false
      const onLoop = new Set(loop)
      shape.points = pts
      // вершины замера, оказавшиеся внутри (напр. точка, из которой мерили)
      shape.innerPoints = [...byId.values()].filter((p) => !onLoop.has(p.id))
      shape.closed = true
      return true
    },

    /** Первый треугольник замера: основание + две стороны от его концов. */
    startTriangleShape(base: number, fromA: number, fromB: number): string | null {
      const err = triangleError(base, fromA, fromB)
      if (err) return err
      const A: XY = { x: 0, y: 0 }
      const B: XY = { x: base, y: 0 }
      const C = apexFrom(A, B, fromA, fromB, -1) // вершина «вверх» на экране
      if (!C) return 'Не удалось построить треугольник'
      const ox = this._bounds().right + 800
      const oy = -Math.min(0, C.y)
      const mk = (p: XY): Point => ({ id: newId(), x: Math.round(p.x + ox), y: Math.round(p.y + oy) })
      this.snapshot()
      const pa = mk(A); const pb = mk(B); const pc = mk(C)
      const shape = makeShape([pa, pb, pc], true)
      shape.triangles = [{ id: newId(), a: pa.id, b: pb.id, c: pc.id }]
      this.shapes = this.shapes.filter((s) => s.points.length > 0)
      this.shapes.push(shape)
      this.activeShapeId = shape.id
      this._rebuildContour(shape)
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.measureBaseKey = null
      this.triPreview = null
      this.tool = 'measure'
      this.persist()
      return null
    },

    /**
     * Считает, куда встанет новый треугольник на стороне baseKey, но ничего
     * не меняет: используется и для предпросмотра, и для самой пристройки.
     */
    _solveAttach(baseKey: string, fromA: number, fromB: number) {
      const shape = this._shapeOfEdge(baseKey)
      if (!shape) return { err: 'Пристраивать можно только к внешним сторонам контура' }
      if (!shape.triangles.length) return { err: 'Фигура не разбита на треугольники' }
      const e = shapeEdges(shape).find((x) => x.key === baseKey)
      if (!e) return { err: 'Эта сторона уже внутри фигуры — пристраивать можно только к внешним' }
      const err = triangleError(e.length, fromA, fromB)
      if (err) return { err }
      const host = shape.triangles.find((t) =>
        ([[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [string, string][]).some(([u, v]) => edgeKey(u, v) === baseKey))
      if (!host) return { err: 'Эта сторона не принадлежит ни одному треугольнику' }
      const byId = pointIndex(shape)
      const thirdId = [host.a, host.b, host.c].find((id) => id !== e.a.id && id !== e.b.id)
      const third = thirdId ? byId.get(thirdId) : undefined
      if (!third) return { err: 'Повреждена разбивка на треугольники' }
      // новую вершину ставим с противоположной стороны от соседнего треугольника
      const side: 1 | -1 = cross3(e.a, e.b, third) > 0 ? -1 : 1
      const apex = apexFrom(e.a, e.b, fromA, fromB, side)
      if (!apex) return { err: 'Засечки не пересекаются — проверьте размеры' }
      // если вершина легла на уже существующую — привариваем к ней (замыкание контура)
      let weldId: string | undefined
      let best = WELD_TOL
      for (const p of shapePoints(shape)) {
        if (p.id === e.a.id || p.id === e.b.id) continue
        const d = Math.hypot(p.x - apex.x, p.y - apex.y)
        if (d <= best) { best = d; weldId = p.id }
      }
      const C: XY = weldId ? byId.get(weldId)! : apex
      const tri: XY[] = [e.a, e.b, C]
      for (const t of shape.triangles) {
        const A = byId.get(t.a); const B = byId.get(t.b); const D = byId.get(t.c)
        if (A && B && D && trianglesOverlap(tri, [A, B, D])) {
          return { err: 'Треугольник накладывается на уже построенные — проверьте размеры или сторону' }
        }
      }
      for (const p of shapePoints(shape)) {
        if (p.id === e.a.id || p.id === e.b.id || p.id === weldId) continue
        if (pointInTri(p, tri[0], tri[1], tri[2])) return { err: 'Внутрь треугольника попадает вершина контура' }
      }
      return { shape, e, apex: C, weldId }
    },

    /** Предпросмотр пристраиваемого треугольника; возвращает текст ошибки. */
    previewTriangle(baseKey: string | null, fromA: number, fromB: number): string | null {
      if (!baseKey || !(fromA > 0) || !(fromB > 0)) { this.triPreview = null; return null }
      const r = this._solveAttach(baseKey, fromA, fromB)
      if ('err' in r && r.err) {
        const e = (this.edges as Edge[]).find((x) => x.key === baseKey)
        this.triPreview = e
          ? { a: { x: e.a.x, y: e.a.y }, b: { x: e.b.x, y: e.b.y }, c: { x: e.a.x, y: e.a.y }, ok: false, msg: r.err }
          : null
        return r.err
      }
      const apex = apexAngleDeg(r.e!.length, fromA, fromB)
      // показываем острый эквивалент: под таким углом реально сходятся рулетки
      const angle = Math.min(apex, 180 - apex)
      const level = quality(angle)
      const factor = errorFactor(angle)
      const weldMsg = r.weldId ? 'Вершина совпала с существующей — контур замкнётся. ' : ''
      this.triPreview = {
        a: { x: r.e!.a.x, y: r.e!.a.y },
        b: { x: r.e!.b.x, y: r.e!.b.y },
        c: { x: r.apex!.x, y: r.apex!.y },
        ok: true,
        level,
        msg: level === 'good'
          ? weldMsg + `Засечка ${Math.round(angle)}° — надёжно`
          : weldMsg + `Засечка всего ${Math.round(angle)}°: ошибка рулетки бьёт по вершине ×${factor.toFixed(1)}. `
            + 'Лучше взять другое основание.',
      }
      return null
    },
    clearPreview() { this.triPreview = null },

    /** Пристраивает треугольник к стороне baseKey; возвращает текст ошибки. */
    attachTriangle(baseKey: string, fromA: number, fromB: number): string | null {
      const r = this._solveAttach(baseKey, fromA, fromB)
      if ('err' in r && r.err) return r.err
      const shape = r.shape!
      this.snapshot()
      const savedPoints = shape.points.slice()
      const savedInner = shape.innerPoints.slice()
      const savedTris = shape.triangles.slice()
      let cid = r.weldId
      if (!cid) {
        const p: Point = { id: newId(), x: Math.round(r.apex!.x), y: Math.round(r.apex!.y) }
        shape.points.push(p)
        cid = p.id
      }
      shape.triangles.push({ id: newId(), a: r.e!.a.id, b: r.e!.b.id, c: cid })
      shape.measureDirty = false
      if (!this._rebuildContour(shape)) {
        shape.points = savedPoints
        shape.innerPoints = savedInner
        shape.triangles = savedTris
        this.past.pop()
        return 'Треугольник разрывает контур — проверьте, к какой стороне пристраиваете'
      }
      this.measureBaseKey = null
      this.triPreview = null
      this.persist()
      return null
    },

    /** Убирает последний построенный треугольник. */
    removeLastTriangle() {
      const s = this._active()
      if (!s.triangles.length) return
      this.snapshot()
      s.triangles.pop()
      if (!s.triangles.length) {
        s.points = []
        s.innerPoints = []
        s.closed = false
      } else {
        const used = new Set(s.triangles.flatMap((t) => [t.a, t.b, t.c]))
        const keep = shapePoints(s).filter((p) => used.has(p.id))
        s.points = keep
        s.innerPoints = []
        this._rebuildContour(s)
      }
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.triPreview = null
      this.persist()
    },

    /** Разбивает уже нарисованную фигуру на непересекающиеся треугольники. */
    triangulateActive(): string | null {
      const s = this._active()
      if (!s.closed || s.points.length < 3) return 'Разбить можно только замкнутую фигуру'
      const tri = earClip(s.points)
      if (!tri.length) return 'Контур самопересекающийся — разбить не удалось'
      this.snapshot()
      const byId = new Map(s.points.map((p) => [p.id, p]))
      s.measureDirty = false
      s.triangles = tri.map(([i, j, k]) => orientTri(
        { id: newId(), a: s.points[i].id, b: s.points[j].id, c: s.points[k].id } as Triangle,
        (id) => byId.get(id),
      ))
      this.persist()
      return null
    },

    clearTriangles() {
      const s = this._active()
      if (!s.triangles.length) return
      this.snapshot()
      s.triangles = []
      this.triPreview = null
      this.persist()
    },

    // ---- history / persistence -----------------------------------------
    undo() {
      const prev = this.past.pop(); if (!prev) return
      this.future.push(this.serialize())
      this.applySerialized(JSON.parse(prev)); this.persist()
    },
    redo() {
      const next = this.future.pop(); if (!next) return
      this.past.push(this.serialize())
      this.applySerialized(JSON.parse(next)); this.persist()
    },

    serialize(): string {
      const model: SerializedModel = {
        version: 2,
        shapes: JSON.parse(JSON.stringify(this.shapes)),
        activeShapeId: this.activeShapeId,
        settings: { ...this.settings },
        order: { ...this.order },
        pricing: { ...this.pricing },
      }
      return JSON.stringify(model)
    },
    applySerialized(model: SerializedModel) {
      if (Array.isArray(model.shapes) && model.shapes.length) {
        for (const s of model.shapes) {
          if (!Array.isArray(s.triangles)) s.triangles = []
          if (!Array.isArray(s.innerPoints)) s.innerPoints = []
          if (typeof s.measureDirty !== 'boolean') s.measureDirty = false
        }
        this.shapes = model.shapes
        this.activeShapeId = model.activeShapeId && model.shapes.some((s) => s.id === model.activeShapeId)
          ? model.activeShapeId : model.shapes[0].id
      }
      if (model.settings) this.settings = { ...this.settings, ...model.settings }
      if (model.order) this.order = { ...this.order, ...model.order }
      if (model.pricing) this.pricing = { ...this.pricing, ...model.pricing }
      // инструмент и выделение — эфемерны: приложение всегда открывается в «Выборе»
      if (model.tool && TOOLS.includes(model.tool as Tool)) this.tool = model.tool as Tool
    },
    exportJSON(): string { return JSON.stringify(JSON.parse(this.serialize()), null, 2) },
    importJSON(text: string) {
      try {
        const model = JSON.parse(text) as SerializedModel
        if (!Array.isArray(model.shapes)) throw new Error('bad model')
        this.snapshot(); this.applySerialized(model); this.persist()
      } catch { /* ignore */ }
    },
    persist() { try { localStorage.setItem(STORAGE_KEY, this.serialize()) } catch { /* ignore */ } },
    load() {
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) this.applySerialized(JSON.parse(raw)) } catch { /* ignore */ }
    },
  },
})
