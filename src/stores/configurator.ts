import { defineStore } from 'pinia'
import type {
  Point, Edge, EdgeProps, Shape, Settings, Order, Pricing, CostBreakdown, SerializedModel,
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

export type Tool = 'select' | 'add' | 'pan' | 'ruler'

interface State {
  shapes: Shape[]
  activeShapeId: string
  selectedPointId: string | null
  selectedEdgeKey: string | null
  settings: Settings
  order: Order
  pricing: Pricing
  tool: Tool
  past: string[]
  future: string[]
}

const STORAGE_KEY = 'nmr.configurator.v2'
const HISTORY_LIMIT = 100

function defaultSettings(): Settings {
  return { gridStep: 100, showGrid: true, showMeasures: true, snap: true, usad: 7, pxPerMm: 0.18 }
}
function defaultOrder(): Order {
  return { client: '', film: 'Глянец', color: 'Белый', currency: 'PLN' }
}
function defaultPricing(): Pricing {
  return { filmPerM2: 45, garpunPerM: 6, seamPerM: 12, workPerM2: 20 }
}

function makeShape(points: Point[], closed: boolean): Shape {
  return { id: newId(), points, closed, edgeProps: {} }
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
      key, a, b,
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
      return state.shapes.flatMap((s) => s.points)
    },
    // per-shape render info
    shapesView(state) {
      return state.shapes.map((s) => ({
        id: s.id,
        closed: s.closed,
        active: s.id === state.activeShapeId,
        points: s.points,
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
        for (let i = 0; i < n; i++) {
          const prev = s.points[(i - 1 + n) % n]
          const cur = s.points[i]
          const next = s.points[(i + 1) % n]
          const v1x = prev.x - cur.x, v1y = prev.y - cur.y
          const v2x = next.x - cur.x, v2y = next.y - cur.y
          const dot = v1x * v2x + v1y * v2y
          const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y)
          const deg = m1 && m2 ? (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180) / Math.PI : 0
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
    selectedPoint(state): Point | null {
      for (const s of state.shapes) {
        const p = s.points.find((q) => q.id === state.selectedPointId)
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
      return this.shapes.find((s) => s.points.some((p) => p.id === id))
    },
    _shapeOfEdge(key: string): Shape | undefined {
      return this.shapes.find((s) => shapeEdges(s).some((e) => e.key === key))
    },
    snapshot() {
      this.past.push(this.serialize())
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
    },
    maybeSnap(v: number): number {
      return this.settings.snap && this.settings.showGrid ? snapValue(v, this.settings.gridStep) : Math.round(v)
    },

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
      this.activeShapeId = shape.id
      this.selectedPointId = p.id
      this.persist()
    },

    /** Enter "draw a new contour" mode: create an empty open shape and switch to the add tool. */
    beginNewShape() {
      this.snapshot()
      this.shapes = this.shapes.filter((s) => s.points.length > 0) // drop leftover empties
      const shape = makeShape([], false)
      this.shapes.push(shape)
      this.activeShapeId = shape.id
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.tool = 'add'
      this.persist()
    },

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
      const p = shape?.points.find((q) => q.id === id)
      if (!p) return
      if (record) this.snapshot()
      p.x = doSnap ? this.maybeSnap(x) : Math.round(x)
      p.y = doSnap ? this.maybeSnap(y) : Math.round(y)
      this.persist()
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
      this.persist()
    },

    deleteSelected() {
      const shape = this.selectedPointId ? this._shapeOfPoint(this.selectedPointId) : undefined
      if (!shape || !this.selectedPointId) return
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
      this.persist()
    },
    selectEdge(key: string | null) {
      this.selectedEdgeKey = key
      this.selectedPointId = null
      if (key) { const s = this._shapeOfEdge(key); if (s) this.activeShapeId = s.id }
      this.persist()
    },
    setTool(tool: Tool) { this.tool = tool; this.persist() },
    setActiveShape(id: string) { this.activeShapeId = id; this.selectedPointId = null; this.persist() },

    toggleClosed() {
      this.snapshot()
      const s = this._active()
      s.closed = !s.closed
      this.persist()
    },

    mirror(axis: 'h' | 'v') {
      this.snapshot()
      const s = this._active()
      const c = centroid(s.points)
      s.points = s.points.map((p) => ({
        id: p.id,
        x: axis === 'h' ? 2 * c.x - p.x : p.x,
        y: axis === 'v' ? 2 * c.y - p.y : p.y,
      })).reverse()
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
        tool: this.tool,
        selectedPointId: this.selectedPointId,
        selectedEdgeKey: this.selectedEdgeKey,
      }
      return JSON.stringify(model)
    },
    applySerialized(model: SerializedModel) {
      if (Array.isArray(model.shapes) && model.shapes.length) {
        this.shapes = model.shapes
        this.activeShapeId = model.activeShapeId && model.shapes.some((s) => s.id === model.activeShapeId)
          ? model.activeShapeId : model.shapes[0].id
      }
      if (model.settings) this.settings = { ...this.settings, ...model.settings }
      if (model.order) this.order = { ...this.order, ...model.order }
      if (model.pricing) this.pricing = { ...this.pricing, ...model.pricing }
      if (model.tool) this.tool = model.tool as Tool
      if (model.selectedPointId !== undefined) this.selectedPointId = model.selectedPointId
      if (model.selectedEdgeKey !== undefined) this.selectedEdgeKey = model.selectedEdgeKey
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
