import { acceptHMRUpdate, defineStore } from 'pinia'
import type {
  Point, Edge, EdgeProps, Shape, ShapeKind, Triangle, Settings, Order, SerializedModel,
} from '../types'
import {
  edgeKey,
  polygonArea,
  diagonals,
  shrink,
  centroid,
  newId,
  pointInPolygon,
  snapValue,
} from '../composables/useGeometry'
import { contourProblem, wallsToPoints, type WallSpec } from '../composables/useWizard'
import { DEFAULT_COLOR, normalizeHex } from '../ceilingColors'
import { t } from '../i18n'
import { priceOf } from '../pricing'
import { DEFAULT_FILM, FILMS, LEGACY_FILMS } from '../filmColors'
import {
  arcInfo,
  arcLength,
  arcMidpoint,
  arcRadius,
  arcSagitta,
  bulgeFromRadius,
  bulgeFromSagitta,
  densify,
} from '../composables/useArcs'
import {
  apexAngleDeg,
  apexFrom,
  boundaryLoop,
  bridgeHoles,
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
  tool: Tool
  /** Контур, который сейчас рисуют (режим «Рисовать»). */
  drawShapeId: string | null
  /** Сторона-основание для следующего треугольника — живёт отдельно от выделения. */
  measureBaseKey: string | null
  /** Ярусы, спрятанные с чертежа: чтобы разбирать многоярусный потолок по слоям. */
  hiddenLevels: number[]
  triPreview: TriPreview | null
  past: string[]
  future: string[]
}

const STORAGE_KEY = 'nmr.configurator.v2'

/**
 * Куда сохраняется чертёж. Каждый проект держит свой ключ, поэтому store
 * проектов подменяет его при переключении. По умолчанию — старый ключ, чтобы
 * работа, сделанная до появления проектов, никуда не делась.
 */
let storageKey = STORAGE_KEY
export function setStorageKey(key: string) { storageKey = key }
export function getStorageKey() { return storageKey }
const HISTORY_LIMIT = 100

function defaultSettings(): Settings {
  return { gridStep: 100, showGrid: true, showMeasures: true, showTriangles: true, snap: true, usad: 7, pxPerMm: 0.18 }
}
function defaultOrder(): Order {
  return { client: '', currency: 'PLN' }
}
/** Свойства стороны по умолчанию: гарпун есть, шва нет, сторона прямая. */
const DEFAULT_EDGE: EdgeProps = { garpun: true, seam: false, bulge: 0 }

function makeShape(points: Point[], closed: boolean): Shape {
  return {
    id: newId(), points, closed, edgeProps: {}, triangles: [], innerPoints: [],
    measureDirty: false, kind: 'ceiling', level: 1, drop: 0,
    colorHex: DEFAULT_COLOR.hex, film: DEFAULT_FILM,
  }
}

/**
 * Контур в точках: скруглённые стороны разложены на хорды. Нужен там, где
 * работают с многоугольником — площадь, попадание, 3D, усадка.
 */
function shapeOutline(shape: Shape, steps = 48) {
  return densify(shape.points, shape.closed, (a, b) => shape.edgeProps[edgeKey(a.id, b.id)]?.bulge ?? 0, steps)
}
/** Площадь контура с учётом скруглений, мм². */
function outlineArea(shape: Shape): number {
  if (!shape.closed || shape.points.length < 3) return 0
  const pts = shapeOutline(shape)
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    sum += p.x * q.y - q.x * p.y
  }
  return Math.abs(sum) / 2
}
/** Точка лежит на самом контуре (вершину могли поставить прямо на стену). */
function onRing(p: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
    t = Math.max(0, Math.min(1, t))
    if (Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)) < 0.6) return true
  }
  return false
}

/**
 * Фигура целиком лежит внутри другой: ВСЕ её вершины внутри контура (или на
 * нём) и она строго меньше по площади.
 *
 * Проверяем именно все вершины, а не центр: у вогнутой фигуры центр может
 * оказаться снаружи, и вложенность бы не опозналась.
 */
function nestedIn(child: Shape, parent: Shape): boolean {
  if (child === parent || !child.closed || !parent.closed) return false
  if (child.points.length < 3 || parent.points.length < 3) return false
  if (!(outlineArea(child) < outlineArea(parent) - 1)) return false
  const ring = shapeOutline(parent)
  return child.points.every((p) => pointInPolygon(p, ring) || onRing(p, ring))
}

/** Совпадающие по месту контуры — например проём и полотно яруса в нём. */
function sameFootprint(a: Shape, b: Shape): boolean {
  if (Math.abs(outlineArea(a) - outlineArea(b)) > 1) return false
  const ca = centroid(a.points)
  const cb = centroid(b.points)
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) < 1
}

/**
 * Контуры, вырезанные в этой фигуре.
 *
 * Правило одно и чисто геометрическое: вырезает ЛЮБАЯ фигура, целиком лежащая
 * внутри — вырез, вложенное полотно, ярус, неважно. Два полотна не могут
 * занимать одно место, поэтому её вершины принадлежат и внешнему контуру:
 * разбивка внешней фигуры обязана на них опираться.
 *
 * Берём только НЕПОСРЕДСТВЕННО вложенные: фигура внутри вложенной фигуры
 * режет её, а не внешнюю.
 */
function holesOf(shape: Shape, all: Shape[]): Shape[] {
  if (!shape.closed || shape.points.length < 3) return []
  const inside = all.filter((s) => nestedIn(s, shape))
  const direct = inside.filter((c) => !inside.some((o) => nestedIn(c, o)))
  const out: Shape[] = []
  for (const c of direct) {
    if (out.some((o) => sameFootprint(o, c))) continue // одно место режем один раз
    out.push(c)
  }
  return out
}

/** Вершины, которые может упоминать разбивка: контур, внутренние и углы вырезов. */
function meshIndex(shape: Shape, all: Shape[]): Map<string, Point> {
  const m = pointIndex(shape)
  for (const h of holesOf(shape, all)) for (const p of h.points) m.set(p.id, p)
  return m
}

/** Стороны, которые идут по контуру: и внешние стены, и обвод вырезов. */
function contourKeys(shape: Shape, all: Shape[]): Set<string> {
  const set = new Set<string>()
  const ring = (pts: Point[]) => {
    for (let i = 0; i < pts.length; i++) set.add(edgeKey(pts[i].id, pts[(i + 1) % pts.length].id))
  }
  if (shape.closed) ring(shape.points)
  for (const h of holesOf(shape, all)) if (h.closed) ring(h.points)
  return set
}

/** Подписи вершин для листа замера: контур — числами, углы выреза — В1, В2… */
function labelIndex(shape: Shape, all: Shape[]): Map<string, string> {
  const m = new Map<string, string>()
  shapePoints(shape).forEach((p, i) => m.set(p.id, p.name || String(i + 1)))
  let k = 0
  for (const h of holesOf(shape, all)) for (const p of h.points) m.set(p.id, 'H' + String(++k))
  return m
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
    const props = { ...DEFAULT_EDGE, ...shape.edgeProps[key] }
    const chord = Math.hypot(a.x - b.x, a.y - b.y)
    out.push({
      key, shapeId: shape.id, a, b,
      length: props.bulge ? arcLength(a, b, props.bulge) : chord,
      chord,
      props,
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
      tool: 'select',
      drawShapeId: null,
      measureBaseKey: null,
      hiddenLevels: [],
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
      return state.shapes.map((s) => {
        const outline = shapeOutline(s, 64)
        return {
          id: s.id,
          closed: s.closed,
          active: s.id === state.activeShapeId,
          kind: s.kind,
          level: s.level,
          drop: s.drop,
          visible: !state.hiddenLevels.includes(s.level),
          colorHex: s.colorHex,
          film: s.film,
          /** Площадь контура, мм² — по ней выбирается самая мелкая фигура под курсором. */
          areaMm: outlineArea(s),
          points: s.points,
          inner: s.innerPoints,
          /** Контур с разложенными дугами — им и рисуем заливку. */
          outline,
          /** Вырезы внутри этого полотна (их контуры тоже с дугами). */
          holes: holesOf(s, state.shapes).map((h) => shapeOutline(h, 64)),
          shrunk: s.closed
            ? shrink(outline.map((p, i) => ({ id: 'o' + i, x: p.x, y: p.y })), state.settings.usad)
            : [],
        }
      })
    },
    edges(state): Edge[] {
      return state.shapes.flatMap((s) => shapeEdges(s))
    },
    /** Площадь полотен за вычетом вырезов, мм². */
    area(state): number {
      let total = 0
      for (const s of state.shapes) {
        if (s.kind !== 'ceiling') continue
        total += outlineArea(s)
        for (const h of holesOf(s, state.shapes)) total -= outlineArea(h)
      }
      return Math.max(0, total)
    },
    /** Суммарная площадь вырезов, мм² — колонны, короба, проёмы под нижний ярус. */
    holeArea(state): number {
      let total = 0
      for (const s of state.shapes) {
        if (s.kind !== 'ceiling') continue
        for (const h of holesOf(s, state.shapes)) total += outlineArea(h)
      }
      return total
    },
    /** Периметр всех контуров, включая обвод вырезов; дуги считаются по длине. */
    perimeterMm(): number {
      return (this.edges as Edge[]).reduce((sum, e) => sum + e.length, 0)
    },
    /** Разбивка по ярусам — каждый ярус это отдельное полотно. */
    levelStats(state): {
      level: number; drop: number; areaM2: number; perimeterM: number; pieces: number; visible: boolean
    }[] {
      const byLevel = new Map<number, { level: number; drop: number; area: number; perimeter: number; pieces: number }>()
      const edges = this.edges as Edge[]
      const perimeterOf = (id: string) => edges.filter((e) => e.shapeId === id).reduce((s, e) => s + e.length, 0)
      for (const s of state.shapes) {
        if (s.kind !== 'ceiling' || !s.closed) continue
        const rec = byLevel.get(s.level) ?? { level: s.level, drop: s.drop, area: 0, perimeter: 0, pieces: 0 }
        rec.area += outlineArea(s)
        rec.perimeter += perimeterOf(s.id)
        rec.pieces += 1
        rec.drop = s.drop
        for (const h of holesOf(s, state.shapes)) {
          rec.area -= outlineArea(h)
          rec.perimeter += perimeterOf(h.id) // обвод выреза тоже крепится
        }
        byLevel.set(s.level, rec)
      }
      return [...byLevel.values()]
        .sort((a, b) => a.level - b.level)
        .map((r) => ({
          level: r.level, drop: r.drop, pieces: r.pieces,
          areaM2: Math.max(0, r.area) / 1_000_000,
          perimeterM: r.perimeter / 1000,
          visible: !state.hiddenLevels.includes(r.level),
        }))
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
      const k = 1 - state.settings.usad / 100
      return ((this.area as number) * k * k) / 1_000_000
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
        const byId = meshIndex(s, state.shapes)
        const contour = contourKeys(s, state.shapes)
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
    measureRows(): { no: number; side: string; len: number; kind: 'contour' | 'diagonal'; area: number }[] {
      const s = this.activeShape as Shape
      const all = this.shapes as Shape[]
      const byId = meshIndex(s, all)
      const num = labelIndex(s, all)
      const contour = contourKeys(s, all)
      const rows: { no: number; side: string; len: number; kind: 'contour' | 'diagonal'; area: number }[] = []
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
            kind: contour.has(edgeKey(u, v)) ? 'contour' : 'diagonal',
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
      if (!s || !s.closed) return 0
      let mm = outlineArea(s)
      for (const h of holesOf(s, this.shapes as Shape[])) mm -= outlineArea(h)
      return Math.max(0, mm) / 1_000_000
    },
    /**
     * Площадь активной фигуры по хордам, без вырезов — с ней сверяется сумма
     * треугольников: замер идёт по прямым, скругления считаются отдельно.
     */
    activeChordAreaM2(): number {
      const s = this.activeShape as Shape
      if (!s || !s.closed) return 0
      let mm = polygonArea(s.points)
      for (const h of holesOf(s, this.shapes as Shape[])) mm -= polygonArea(h.points)
      return Math.max(0, mm) / 1_000_000
    },
    /**
     * Разбивка устарела: контур или вырезы изменились после того, как её
     * построили. Самая частая причина — фигуру нарисовали внутри уже
     * размеченного полотна: сетка про неё не знает и идёт сквозь.
     */
    meshStale(): boolean {
      const s = this.activeShape as Shape
      if (!s || !s.triangles.length) return false
      const cutters = holesOf(s, this.shapes as Shape[])
      const used = new Set(s.triangles.flatMap((t) => [t.a, t.b, t.c]))
      for (const h of cutters) {
        for (const p of h.points) if (!used.has(p.id)) return true
      }
      const known = new Set([
        ...shapePoints(s).map((p) => p.id),
        ...cutters.flatMap((h) => h.points.map((p) => p.id)),
      ])
      for (const id of used) if (!known.has(id)) return true
      return false
    },
    /** Сколько вырезов видит программа в активной фигуре. */
    activeHoleCount(): number {
      const s = this.activeShape as Shape
      return s ? holesOf(s, this.shapes as Shape[]).length : 0
    },
    /** Самый нижний заведённый ярус. */
    maxLevel(state): number {
      return state.shapes.reduce((m, s) => Math.max(m, s.level), 1)
    },
    /** Скруглённые стороны активной фигуры — то, что мерят хордой и стрелкой. */
    arcRows(): { side: string; chord: number; sagitta: number; radius: number; length: number }[] {
      const s = this.activeShape as Shape
      const num = new Map(s.points.map((p, i) => [p.id, i + 1]))
      return (this.activeEdges as (Edge & { i1: number; i2: number })[])
        .filter((e) => e.props.bulge)
        .map((e) => ({
          side: `${num.get(e.a.id) ?? '?'}–${num.get(e.b.id) ?? '?'}`,
          chord: Math.round(e.chord),
          sagitta: Math.round(arcSagitta(e.a, e.b, e.props.bulge)),
          radius: Math.round(arcRadius(e.a, e.b, e.props.bulge)),
          length: Math.round(e.length),
        }))
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
    /**
     * Метраж и цена по каждому полотну: площадь за вычетом своих вырезов,
     * периметр и крепёж — вместе с обводом этих вырезов. Прайс статичный.
     */
    shapeStats(state): { id: string; areaM2: number; perimM: number; price: number }[] {
      const edges = this.edges as Edge[]
      return state.shapes
        .filter((s) => s.kind === 'ceiling' && s.closed)
        .map((s) => {
          const holes = holesOf(s, state.shapes)
          const ids = [s.id, ...holes.map((h) => h.id)]
          const own = edges.filter((e) => ids.includes(e.shapeId))
          const areaMm = holes.reduce((a, h) => a - outlineArea(h), outlineArea(s))
          const sum = (list: Edge[]) => list.reduce((n, e) => n + e.length, 0)
          const areaM2 = Math.max(0, areaMm) / 1_000_000
          return {
            id: s.id,
            areaM2,
            perimM: sum(own) / 1000,
            price: priceOf({
              areaM2,
              garpunM: sum(own.filter((e) => e.props.garpun)) / 1000,
              seamM: sum(own.filter((e) => e.props.seam)) / 1000,
              film: s.film,
            }),
          }
        })
    },
    /** Полотно, из которого вычитается вырез. Нет такого — вырез бесполезен. */
    hostOfActive(state): Shape | null {
      const s = this.activeShape as Shape
      return state.shapes.find((x) => x.id !== s.id && x.kind === 'ceiling' && nestedIn(s, x)) ?? null
    },
    /** Цифры выбранного полотна — их показывают рядом с общими. */
    activeStats(state): { areaM2: number; perimM: number; price: number } {
      const s = (this.shapeStats as { id: string; areaM2: number; perimM: number; price: number }[])
        .find((x) => x.id === state.activeShapeId)
      return s ?? { areaM2: 0, perimM: 0, price: 0 }
    },
    /** Итого по чертежу. */
    totals(): { areaM2: number; perimM: number; price: number } {
      return (this.shapeStats as { areaM2: number; perimM: number; price: number }[]).reduce(
        (a, s) => ({ areaM2: a.areaM2 + s.areaM2, perimM: a.perimM + s.perimM, price: a.price + s.price }),
        { areaM2: 0, perimM: 0, price: 0 },
      )
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

    /**
     * Врезает вершину в сторону. Без `at` — ровно в середину; с `at` — в то
     * место, где стоит ручка под курсором.
     */
    insertOnEdge(key: string, at?: { x: number; y: number }): string | null {
      const e = (this.edges as Edge[]).find((x) => x.key === key)
      if (!e) return null
      const shape = this.shapes.find((s) => s.id === e.shapeId)
      if (!shape) return null

      /*
       * У скруглённой стороны точка садится на саму дугу, а центральный угол
       * делится между половинами — форма от деления не меняется. Дальше
       * половины гнут по отдельности: так получается несимметричный контур,
       * которого одной дугой не сделать.
       */
      const info = e.props.bulge ? arcInfo(e.a, e.b, e.props.bulge) : null
      let split: { p: Point; b1: number; b2: number } | null = null
      if (info) {
        const target = at ?? arcMidpoint(e.a, e.b, e.props.bulge)
        const ang = Math.atan2(target.y - info.cy, target.x - info.cx)
        const dir = Math.sign(info.theta)
        let t1 = ang - info.start
        while (t1 * dir < 0) t1 += 2 * Math.PI * dir
        while (Math.abs(t1) > Math.abs(info.theta)) t1 -= 2 * Math.PI * dir
        const t2 = info.theta - t1
        // у самого конца дуги делить нечего
        if (Math.abs(t1) > 0.05 && Math.abs(t2) > 0.05) {
          split = {
            p: {
              id: newId(),
              x: Math.round(info.cx + Math.cos(ang) * info.r),
              y: Math.round(info.cy + Math.sin(ang) * info.r),
            },
            b1: Math.tan(t1 / 4),
            b2: Math.tan(t2 / 4),
          }
        }
      }

      this.snapshot()
      const spot = at ?? { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
      const p: Point = split?.p ?? { id: newId(), x: Math.round(spot.x), y: Math.round(spot.y) }
      const idx = shape.points.findIndex((q) => q.id === e.a.id)
      shape.points.splice(idx + 1, 0, p)
      if (split) {
        const props = shape.edgeProps[key] ?? { ...DEFAULT_EDGE }
        delete shape.edgeProps[key]
        shape.edgeProps[edgeKey(e.a.id, p.id)] = { ...props, bulge: split.b1 }
        shape.edgeProps[edgeKey(p.id, e.b.id)] = { ...props, bulge: split.b2 }
      }
      this._invalidateTriangles(shape)
      this.activeShapeId = shape.id
      this.selectedPointId = p.id
      this.selectedEdgeKey = null
      this.persist()
      return p.id
    },

    /**
     * Скруглить угол радиусом R — то, что в заказе пишут как «R300».
     *
     * Угол убирается, вместо него встают две точки касания и дуга между ними.
     * Радиус ужимается, если стороны короткие: лучше скруглить меньше, чем
     * порвать контур. Возвращает фактический радиус; 0 — скруглять нечего.
     */
    roundCorner(pointId: string, radius: number): number {
      const shape = this._shapeOfPoint(pointId)
      if (!shape || !shape.closed || shape.points.length < 3 || !(radius > 0)) return 0
      const n = shape.points.length
      const i = shape.points.findIndex((p) => p.id === pointId)
      if (i < 0) return 0
      const P = shape.points[i]
      const A = shape.points[(i - 1 + n) % n]
      const B = shape.points[(i + 1) % n]
      const la = Math.hypot(A.x - P.x, A.y - P.y)
      const lb = Math.hypot(B.x - P.x, B.y - P.y)
      if (la < 1 || lb < 1) return 0
      const ua = { x: (A.x - P.x) / la, y: (A.y - P.y) / la }
      const ub = { x: (B.x - P.x) / lb, y: (B.y - P.y) / lb }
      const theta = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y)))
      if (!(theta > 0.05 && theta < Math.PI - 0.05)) return 0 // почти прямая
      const half = Math.tan(theta / 2)
      // отступ по каждой стороне — не больше половины, иначе соседние
      // скругления съедят друг друга
      const t = Math.min(radius / half, la / 2, lb / 2)
      const r = Math.round(t * half)
      if (r < 1) return 0
      const p1: Point = { id: newId(), x: Math.round(P.x + ua.x * t), y: Math.round(P.y + ua.y * t) }
      const p2: Point = { id: newId(), x: Math.round(P.x + ub.x * t), y: Math.round(P.y + ub.y * t) }
      // центральный угол дуги — дополнение к углу контура; выгиб в сторону
      // убранного угла, иначе скругление вывернется внутрь
      let bulge = Math.tan((Math.PI - theta) / 4)
      const toCorner = (b: number) => {
        const m = arcMidpoint(p1, p2, b)
        return Math.hypot(m.x - P.x, m.y - P.y)
      }
      if (toCorner(-bulge) < toCorner(bulge)) bulge = -bulge

      this.snapshot()
      const keepA = shape.edgeProps[edgeKey(A.id, P.id)]
      const keepB = shape.edgeProps[edgeKey(P.id, B.id)]
      delete shape.edgeProps[edgeKey(A.id, P.id)]
      delete shape.edgeProps[edgeKey(P.id, B.id)]
      shape.points.splice(i, 1, p1, p2)
      if (keepA) shape.edgeProps[edgeKey(A.id, p1.id)] = { ...keepA, bulge: 0 }
      if (keepB) shape.edgeProps[edgeKey(p2.id, B.id)] = { ...keepB, bulge: 0 }
      shape.edgeProps[edgeKey(p1.id, p2.id)] = { ...DEFAULT_EDGE, bulge }
      this._invalidateTriangles(shape)
      this.selectedPointId = null
      this.selectedEdgeKey = edgeKey(p1.id, p2.id)
      this.persist()
      return r
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
      const cur = { ...DEFAULT_EDGE, ...shape.edgeProps[key] }
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


    // ---- слои (ярусы) ---------------------------------------------------
    /** Прячет ярус с чертежа; активная фигура при этом уходит на видимый. */
    setLevelVisible(level: number, visible: boolean) {
      const hidden = new Set(this.hiddenLevels)
      if (visible) hidden.delete(level)
      else hidden.add(level)
      this.hiddenLevels = [...hidden].sort((a, b) => a - b)
      this._keepActiveVisible()
      this.persist()
    },
    toggleLevelVisible(level: number) {
      this.setLevelVisible(level, this.hiddenLevels.includes(level))
    },
    /** Показать только этот ярус. */
    isolateLevel(level: number) {
      this.hiddenLevels = (this.levelStats as { level: number }[])
        .map((l) => l.level)
        .filter((l) => l !== level)
      this._keepActiveVisible()
      this.persist()
    },
    /**
     * Показать первые n ярусов по порядку — так многоярусный потолок
     * разбирается по слоям: сначала основной, потом каждый следующий.
     */
    showUpToLevel(n: number) {
      const levels = (this.levelStats as { level: number }[]).map((l) => l.level)
      this.hiddenLevels = levels.slice(Math.max(1, n))
      this._keepActiveVisible()
      this.persist()
    },
    showAllLevels() {
      this.hiddenLevels = []
      this.persist()
    },
    _keepActiveVisible() {
      const active = this._active()
      if (active && !this.hiddenLevels.includes(active.level)) return
      const next = this.shapes.find((s) => !this.hiddenLevels.includes(s.level))
      if (next) {
        this.activeShapeId = next.id
        this.clearSelection()
      }
    },
    /** Новый ярус: начинаем рисовать полотно следующего уровня с перепадом. */
    addLevel(drop?: number) {
      const level = (this.maxLevel as number) + 1
      this.beginDraw()
      const s = this.shapes.find((x) => x.id === this.drawShapeId)
      if (s) {
        s.level = level
        s.drop = drop ?? (level - 1) * 100
      }
      this.showAllLevels()
    },

    /** Полотно или вырез. Вырез вычитается из контура, внутри которого лежит. */
    setShapeKind(id: string, kind: ShapeKind) {
      const s = this.shapes.find((x) => x.id === id)
      if (!s || s.kind === kind) return
      this.snapshot()
      s.kind = kind
      if (kind === 'hole') {
        // у выреза нет собственного полотна — ярус берём у фигуры, в которой он лежит
        const host = (this.shapes as Shape[])
          .filter((x) => x.kind === 'ceiling' && nestedIn(s, x))
          .sort((a, b) => outlineArea(a) - outlineArea(b))[0]
        if (host) s.level = host.level
      }
      this.persist()
    },
    /** Ярус и его перепад вниз от основного уровня. */
    setShapeLevel(id: string, level: number, drop?: number) {
      const s = this.shapes.find((x) => x.id === id)
      if (!s) return
      this.snapshot()
      s.level = Math.max(1, Math.round(level))
      if (drop !== undefined) s.drop = Math.max(0, Math.round(drop))
      this.persist()
    },
    setShapeDrop(id: string, drop: number) {
      const s = this.shapes.find((x) => x.id === id)
      if (!s) return
      this.snapshot()
      s.drop = Math.max(0, Math.round(drop))
      this.persist()
    },

    /** Скругление стороны напрямую (bulge = tan(θ/4)). */
    setEdgeBulge(key: string, bulge: number, record = true) {
      const shape = this._shapeOfEdge(key)
      if (!shape) return
      if (record) this.snapshot()
      const cur = { ...DEFAULT_EDGE, ...shape.edgeProps[key] }
      shape.edgeProps[key] = { ...cur, bulge: Math.max(-4, Math.min(4, bulge || 0)) }
      this._touchMeasure(shape)
      if (record) this.persist()
    },
    /** Скругление по замеру «стрелка от хорды», мм. */
    setEdgeSagitta(key: string, sagitta: number) {
      const e = (this.edges as Edge[]).find((x) => x.key === key)
      if (!e) return
      const sign = e.props.bulge < 0 ? -1 : 1
      this.setEdgeBulge(key, bulgeFromSagitta(e.chord, Math.abs(sagitta)) * sign)
    },
    /** Скругление по радиусу, мм. */
    setEdgeRadius(key: string, radius: number) {
      const e = (this.edges as Edge[]).find((x) => x.key === key)
      if (!e) return
      const sign = e.props.bulge < 0 ? -1 : 1
      this.setEdgeBulge(key, bulgeFromRadius(e.chord, Math.abs(radius)) * sign)
    },
    /** Перекинуть дугу на другую сторону хорды. */
    flipEdgeArc(key: string) {
      const e = (this.edges as Edge[]).find((x) => x.key === key)
      if (!e || !e.props.bulge) return
      this.setEdgeBulge(key, -e.props.bulge)
    },
    straightenEdge(key: string) { this.setEdgeBulge(key, 0) },

    updateSettings(patch: Partial<Settings>) { this.settings = { ...this.settings, ...patch }; this.persist() },
    updateOrder(patch: Partial<Order>) { this.order = { ...this.order, ...patch }; this.persist() },
    setShapeColor(id: string, hex: string) {
      const s = this.shapes.find((x) => x.id === id)
      const h = normalizeHex(hex)
      if (!s || !h) return
      this.snapshot()
      s.colorHex = h
      this.persist()
    },
    setShapeFilm(id: string, film: string) {
      const s = this.shapes.find((x) => x.id === id)
      if (!s || !FILMS.includes(film)) return
      this.snapshot()
      s.film = film
      this.persist()
    },

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
    /**
     * Круг: четыре точки по сторонам света и по четверти окружности между
     * ними (bulge = tan(θ/4) при θ = 90°). Так круг остаётся обычным
     * контуром — его можно тянуть за точки и мерить, как любой другой.
     */
    insertCircle(diameter: number) {
      this.snapshot()
      const r = Math.max(50, Math.round(diameter / 2))
      const pts: Point[] = [
        { id: newId(), x: 2 * r, y: r },
        { id: newId(), x: r, y: 2 * r },
        { id: newId(), x: 0, y: r },
        { id: newId(), x: r, y: 0 },
      ]
      const s = makeShape(pts, true)
      const quarter = Math.tan(Math.PI / 8)
      for (let i = 0; i < pts.length; i++) {
        s.edgeProps[edgeKey(pts[i].id, pts[(i + 1) % pts.length].id)] =
          { ...DEFAULT_EDGE, bulge: quarter }
      }
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
    /**
     * Контур из мастера: обход стен превращается в углы с именами.
     * Возвращает текст ошибки, если обход складывается сам на себя.
     */
    insertFromWalls(walls: WallSpec[]): string | null {
      const pts = wallsToPoints(walls)
      if (pts.length < 3) return t('wizard.errFew')
      const bad = contourProblem(pts)
      if (bad) return bad
      this.snapshot()
      const s = makeShape(
        pts.map((p) => ({ id: newId(), x: p.x, y: p.y, name: p.name || undefined })),
        true,
      )
      this.shapes = [s]
      this.activeShapeId = s.id
      this.selectedPointId = null
      this.selectedEdgeKey = null
      this.persist()
      return null
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
      if (!C) return t('measure.errNoTriangle')
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
      if (!shape) return { err: t('measure.errOuterOnly') }
      if (!shape.triangles.length) return { err: t('measure.errNotSplit') }
      if (holesOf(shape, this.shapes as Shape[]).length) {
        return { err: t('measure.errHasHole') }
      }
      const e = shapeEdges(shape).find((x) => x.key === baseKey)
      if (!e) return { err: t('measure.errInside') }
      const err = triangleError(e.length, fromA, fromB)
      if (err) return { err }
      const host = shape.triangles.find((t) =>
        ([[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [string, string][]).some(([u, v]) => edgeKey(u, v) === baseKey))
      if (!host) return { err: t('measure.errNoHost') }
      const byId = pointIndex(shape)
      const thirdId = [host.a, host.b, host.c].find((id) => id !== e.a.id && id !== e.b.id)
      const third = thirdId ? byId.get(thirdId) : undefined
      if (!third) return { err: t('measure.errBrokenMesh') }
      // новую вершину ставим с противоположной стороны от соседнего треугольника
      const side: 1 | -1 = cross3(e.a, e.b, third) > 0 ? -1 : 1
      const apex = apexFrom(e.a, e.b, fromA, fromB, side)
      if (!apex) return { err: t('measure.errNoCross') }
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
      for (const other of shape.triangles) {
        const A = byId.get(other.a); const B = byId.get(other.b); const D = byId.get(other.c)
        if (A && B && D && trianglesOverlap(tri, [A, B, D])) {
          return { err: t('measure.errOverlap') }
        }
      }
      for (const p of shapePoints(shape)) {
        if (p.id === e.a.id || p.id === e.b.id || p.id === weldId) continue
        if (pointInTri(p, tri[0], tri[1], tri[2])) return { err: t('measure.errVertexInside') }
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
      const weldMsg = r.weldId ? t('measure.weld') : ''
      this.triPreview = {
        a: { x: r.e!.a.x, y: r.e!.a.y },
        b: { x: r.e!.b.x, y: r.e!.b.y },
        c: { x: r.apex!.x, y: r.apex!.y },
        ok: true,
        level,
        msg: level === 'good'
          ? weldMsg + t('measure.good', { deg: Math.round(angle) })
          : weldMsg + t('measure.poor', { deg: Math.round(angle), factor: factor.toFixed(1) }),
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
        return t('measure.errTears')
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
      if (!s.closed || s.points.length < 3) return t('measure.errClosedOnly')

      // вырез вшиваем в контур мостом: иначе треугольники пройдут сквозь дыру,
      // а замерщику нужно, чтобы они упирались в её углы
      const holes = holesOf(s, this.shapes as Shape[])
      const ring = bridgeHoles(
        s.points.map((p) => ({ id: p.id, x: p.x, y: p.y })),
        holes.map((h) => h.points.map((p) => ({ id: p.id, x: p.x, y: p.y }))),
      )
      if (!ring) return t('measure.errHoleWalk')

      const tri = earClip(ring)
      if (!tri.length) return t('measure.errSelfCross')
      this.snapshot()
      const byId = new Map(ring.map((p) => [p.id, p]))
      s.measureDirty = false
      s.triangles = tri
        .map(([i, j, k]) => [ring[i].id, ring[j].id, ring[k].id])
        // мост дублирует вершину контура и вершину выреза — вырожденное отбрасываем
        .filter(([a, b, c]) => a !== b && b !== c && a !== c)
        .map(([a, b, c]) => orientTri({ id: newId(), a, b, c } as Triangle, (id) => byId.get(id)))
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
        version: 3,
        shapes: JSON.parse(JSON.stringify(this.shapes)),
        activeShapeId: this.activeShapeId,
        settings: { ...this.settings },
        order: { ...this.order },
        hiddenLevels: [...this.hiddenLevels],
      }
      return JSON.stringify(model)
    },
    applySerialized(model: SerializedModel) {
      if (Array.isArray(model.shapes) && model.shapes.length) {
        for (const s of model.shapes) {
          if (!Array.isArray(s.triangles)) s.triangles = []
          if (!Array.isArray(s.innerPoints)) s.innerPoints = []
          if (typeof s.measureDirty !== 'boolean') s.measureDirty = false
          if (s.kind !== 'hole') s.kind = 'ceiling'
          if (!(s.level >= 1)) s.level = 1
          if (!(s.drop >= 0)) s.drop = 0
          s.colorHex = normalizeHex(s.colorHex ?? '') ?? DEFAULT_COLOR.hex
          // до v3 плёнка хранилась русским названием — переносим на идентификатор
          if (LEGACY_FILMS[s.film]) s.film = LEGACY_FILMS[s.film]
          if (!FILMS.includes(s.film)) s.film = DEFAULT_FILM
          for (const k of Object.keys(s.edgeProps ?? {})) {
            s.edgeProps[k] = { ...DEFAULT_EDGE, ...s.edgeProps[k] }
          }
        }
        this.shapes = model.shapes
        this.activeShapeId = model.activeShapeId && model.shapes.some((s) => s.id === model.activeShapeId)
          ? model.activeShapeId : model.shapes[0].id
      }
      if (model.settings) this.settings = { ...this.settings, ...model.settings }
      if (model.order) this.order = { ...this.order, ...model.order }
      this.hiddenLevels = Array.isArray(model.hiddenLevels) ? model.hiddenLevels : []
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
    persist() { try { localStorage.setItem(storageKey, this.serialize()) } catch { /* ignore */ } },
    load() {
      try { const raw = localStorage.getItem(storageKey); if (raw) this.applySerialized(JSON.parse(raw)) } catch { /* ignore */ }
    },
  },
})

/**
 * Горячая замена стора. Без неё Vite обновлял компоненты, а экземпляр стора
 * оставался прежним — со старыми геттерами и действиями. Выглядело так, будто
 * правки логики не применяются, пока не перезагрузишь страницу руками.
 */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useConfigurator, import.meta.hot))
}
