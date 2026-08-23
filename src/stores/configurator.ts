import { defineStore } from 'pinia'
import type { Point, Edge, EdgeProps, Settings, Order, Pricing, CostBreakdown, SerializedModel } from '../types'
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
  points: Point[]
  edgeProps: Record<string, EdgeProps>
  closed: boolean
  selectedPointId: string | null
  selectedEdgeKey: string | null
  settings: Settings
  order: Order
  pricing: Pricing
  tool: Tool
  past: string[]
  future: string[]
}

const STORAGE_KEY = 'nmr.configurator.v1'
const HISTORY_LIMIT = 100

function defaultSettings(): Settings {
  return {
    gridStep: 100,
    showGrid: true,
    showMeasures: true,
    snap: true,
    usad: 7,
    pxPerMm: 0.18,
  }
}

function defaultOrder(): Order {
  return { client: '', film: 'Глянец', color: 'Белый', currency: 'PLN' }
}

function defaultPricing(): Pricing {
  return { filmPerM2: 45, garpunPerM: 6, seamPerM: 12, workPerM2: 20 }
}

/** A simple rectangle to start from (2000 x 3000 mm). */
function seedRect(): Point[] {
  return [
    { id: newId(), x: 0, y: 0 },
    { id: newId(), x: 3000, y: 0 },
    { id: newId(), x: 3000, y: 2000 },
    { id: newId(), x: 0, y: 2000 },
  ]
}

export const useConfigurator = defineStore('configurator', {
  state: (): State => ({
    points: seedRect(),
    edgeProps: {},
    closed: true,
    selectedPointId: null,
    selectedEdgeKey: null,
    settings: defaultSettings(),
    order: defaultOrder(),
    pricing: defaultPricing(),
    tool: 'select',
    past: [],
    future: [],
  }),

  getters: {
    edges(state): Edge[] {
      const n = state.points.length
      if (n < 2) return []
      const out: Edge[] = []
      const last = state.closed ? n : n - 1
      for (let i = 0; i < last; i++) {
        const a = state.points[i]
        const b = state.points[(i + 1) % n]
        const key = edgeKey(a.id, b.id)
        out.push({
          key,
          a,
          b,
          length: Math.hypot(a.x - b.x, a.y - b.y),
          props: state.edgeProps[key] ?? { garpun: true, seam: false },
        })
      }
      return out
    },
    area(state): number {
      return state.closed ? polygonArea(state.points) : 0
    },
    perimeterMm(state): number {
      return perimeter(state.points, state.closed)
    },
    diagonalList(state) {
      return state.closed ? diagonals(state.points) : []
    },
    /** Interior angle (degrees) at each vertex, for on-canvas labels. */
    angles(state): { id: string; deg: number }[] {
      const n = state.points.length
      if (n < 3 || !state.closed) return []
      const out: { id: string; deg: number }[] = []
      for (let i = 0; i < n; i++) {
        const prev = state.points[(i - 1 + n) % n]
        const cur = state.points[i]
        const next = state.points[(i + 1) % n]
        const v1x = prev.x - cur.x, v1y = prev.y - cur.y
        const v2x = next.x - cur.x, v2y = next.y - cur.y
        const dot = v1x * v2x + v1y * v2y
        const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y)
        const deg = m1 && m2 ? (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180) / Math.PI : 0
        out.push({ id: cur.id, deg: Math.round(deg) })
      }
      return out
    },
    shrunk(state): Point[] {
      return state.closed ? shrink(state.points, state.settings.usad) : []
    },
    selectedPoint(state): Point | null {
      return state.points.find((p) => p.id === state.selectedPointId) ?? null
    },
    garpunLength(): number {
      // total length of edges flagged with garpun
      return (this.edges as Edge[])
        .filter((e) => e.props.garpun)
        .reduce((s, e) => s + e.length, 0)
    },
    seamLength(): number {
      return (this.edges as Edge[])
        .filter((e) => e.props.seam)
        .reduce((s, e) => s + e.length, 0)
    },
    /** Cost breakdown (валюта из order.currency). */
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
    snapshot() {
      this.past.push(this.serialize())
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
    },

    maybeSnap(v: number): number {
      // snap to grid intersections only while the grid is shown and snapping is on
      return this.settings.snap && this.settings.showGrid
        ? snapValue(v, this.settings.gridStep)
        : Math.round(v)
    },

    addPoint(x: number, y: number, afterId?: string, doSnap = true) {
      this.snapshot()
      const p: Point = {
        id: newId(),
        x: doSnap ? this.maybeSnap(x) : Math.round(x),
        y: doSnap ? this.maybeSnap(y) : Math.round(y),
      }
      if (afterId) {
        const idx = this.points.findIndex((q) => q.id === afterId)
        this.points.splice(idx + 1, 0, p)
      } else {
        this.points.push(p)
      }
      this.selectedPointId = p.id
      this.persist()
    },

    movePoint(id: string, x: number, y: number, record = true) {
      const p = this.points.find((q) => q.id === id)
      if (!p) return
      if (record) this.snapshot()
      p.x = this.maybeSnap(x)
      p.y = this.maybeSnap(y)
      this.persist()
    },

    /** Set an edge length by moving its second endpoint along the edge direction. */
    setEdgeLength(key: string, lengthMm: number) {
      const e = (this.edges as Edge[]).find((ed) => ed.key === key)
      if (!e || lengthMm <= 0) return
      this.snapshot()
      const dx = e.b.x - e.a.x
      const dy = e.b.y - e.a.y
      const cur = Math.hypot(dx, dy) || 1
      const ux = dx / cur
      const uy = dy / cur
      const target = this.points.find((q) => q.id === e.b.id)
      if (target) {
        target.x = Math.round(e.a.x + ux * lengthMm)
        target.y = Math.round(e.a.y + uy * lengthMm)
      }
      this.persist()
    },

    deleteSelected() {
      if (this.selectedPointId && this.points.length > 3) {
        this.snapshot()
        this.points = this.points.filter((p) => p.id !== this.selectedPointId)
        this.selectedPointId = null
        this.persist()
      }
    },

    setEdgeProp(key: string, prop: keyof EdgeProps, value: boolean) {
      this.snapshot()
      const cur = this.edgeProps[key] ?? { garpun: true, seam: false }
      this.edgeProps[key] = { ...cur, [prop]: value }
      this.persist()
    },

    selectPoint(id: string | null) {
      this.selectedPointId = id
      this.selectedEdgeKey = null
    },
    selectEdge(key: string | null) {
      this.selectedEdgeKey = key
      this.selectedPointId = null
    },
    setTool(tool: Tool) {
      this.tool = tool
    },

    toggleClosed() {
      this.snapshot()
      this.closed = !this.closed
      this.persist()
    },

    updateSettings(patch: Partial<Settings>) {
      this.settings = { ...this.settings, ...patch }
      this.persist()
    },
    updateOrder(patch: Partial<Order>) {
      this.order = { ...this.order, ...patch }
      this.persist()
    },
    updatePricing(patch: Partial<Pricing>) {
      this.pricing = { ...this.pricing, ...patch }
      this.persist()
    },

    undo() {
      const prev = this.past.pop()
      if (!prev) return
      this.future.push(this.serialize())
      this.applySerialized(JSON.parse(prev))
      this.persist()
    },
    redo() {
      const next = this.future.pop()
      if (!next) return
      this.past.push(this.serialize())
      this.applySerialized(JSON.parse(next))
      this.persist()
    },

    reset(shape: 'rect' | 'empty' = 'rect') {
      this.snapshot()
      this.points = shape === 'rect' ? seedRect() : []
      this.edgeProps = {}
      this.closed = shape === 'rect'
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.persist()
    },

    /** Прямоугольник — create a rectangle by width x height (mm). Like TInsertpryam. */
    insertRectangle(w: number, h: number) {
      if (w <= 0 || h <= 0) return
      this.snapshot()
      this.points = [
        { id: newId(), x: 0, y: 0 },
        { id: newId(), x: w, y: 0 },
        { id: newId(), x: w, y: h },
        { id: newId(), x: 0, y: h },
      ]
      this.edgeProps = {}
      this.closed = true
      this.selectedPointId = null
      this.persist()
    },

    /** Г-образный / L-shape contour by outer w×h and cut-out cw×ch. */
    insertLShape(w: number, h: number, cw: number, ch: number) {
      if (w <= 0 || h <= 0) return
      this.snapshot()
      this.points = [
        { id: newId(), x: 0, y: 0 },
        { id: newId(), x: w, y: 0 },
        { id: newId(), x: w, y: h - ch },
        { id: newId(), x: w - cw, y: h - ch },
        { id: newId(), x: w - cw, y: h },
        { id: newId(), x: 0, y: h },
      ]
      this.edgeProps = {}
      this.closed = true
      this.selectedPointId = null
      this.persist()
    },

    /** Зеркало — mirror the contour horizontally (axis='h') or vertically. */
    mirror(axis: 'h' | 'v') {
      this.snapshot()
      const c = centroid(this.points)
      this.points = this.points.map((p) => ({
        id: p.id,
        x: axis === 'h' ? 2 * c.x - p.x : p.x,
        y: axis === 'v' ? 2 * c.y - p.y : p.y,
      }))
      // reverse to keep winding order consistent
      this.points.reverse()
      this.persist()
    },

    // ---- serialization -------------------------------------------------
    serialize(): string {
      const model: SerializedModel = {
        version: 1,
        points: this.points.map((p) => ({ ...p })),
        edgeProps: JSON.parse(JSON.stringify(this.edgeProps)),
        closed: this.closed,
        settings: { ...this.settings },
        order: { ...this.order },
        pricing: { ...this.pricing },
      }
      return JSON.stringify(model)
    },
    applySerialized(model: SerializedModel) {
      this.points = model.points
      this.edgeProps = model.edgeProps ?? {}
      this.closed = model.closed
      if (model.settings) this.settings = { ...this.settings, ...model.settings }
      if (model.order) this.order = { ...this.order, ...model.order }
      if (model.pricing) this.pricing = { ...this.pricing, ...model.pricing }
    },
    exportJSON(): string {
      return JSON.stringify(JSON.parse(this.serialize()), null, 2)
    },
    importJSON(text: string) {
      try {
        const model = JSON.parse(text) as SerializedModel
        if (!Array.isArray(model.points)) throw new Error('bad model')
        this.snapshot()
        this.applySerialized(model)
        this.persist()
      } catch {
        // ignore malformed input
      }
    },

    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, this.serialize())
      } catch {
        /* storage may be unavailable */
      }
    },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) this.applySerialized(JSON.parse(raw))
      } catch {
        /* ignore */
      }
    },
  },
})
