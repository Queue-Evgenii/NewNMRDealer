<script setup lang="ts">
/**
 * Холст конструктора.
 *
 * Модель ввода — как в Figma/draw.io, но под замер потолков и под палец:
 *  • жесты одинаковы во всех режимах: тяга по пустому — панорама, два пальца —
 *    панорама+зум, колесо — зум к курсору, пробел — временная «рука»;
 *  • геометрию можно менять ТОЛЬКО в режиме «Выбор». В «Рисовать», «Линейке»
 *    и «Замере» перетаскивание всегда панорамирует — испортить чертёж нельзя;
 *  • что произойдёт по нажатию, решает один hit-тест в экранных пикселях
 *    (вершина → ручка середины → сторона → заливка → пусто), а не набор
 *    скрытых условий. Цели заданы в px, поэтому на тачскрине они крупнее.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { filmColor } from '../filmColors'
import { arcMidpoint, bulgeFromPoint, sampleArc } from '../composables/useArcs'
import type { Edge, Point } from '../types'

const store = useConfigurator()
const {
  shapesView, allPoints, edges, activeEdges, settings, selectedPointId, selectedEdgeKey,
  tool, angles, order, activeShape, trianglesView, triPreview, measureBaseKey,
} = storeToRefs(store)

const svgRef = ref<SVGSVGElement | null>(null)

// ---- вид (панорама / зум) в мм ------------------------------------------
const zoom = ref(settings.value.pxPerMm)
const panX = ref(-400)
const panY = ref(-400)
const sizePx = ref({ w: 800, h: 600 })

const VIEW_KEY = 'nmr.configurator.view'
let viewTimer = 0
function saveViewDebounced() {
  clearTimeout(viewTimer)
  viewTimer = window.setTimeout(() => {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ z: zoom.value, x: panX.value, y: panY.value })) } catch { /* ignore */ }
  }, 300)
}
function restoreView(): boolean {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (!raw) return false
    const v = JSON.parse(raw)
    if (typeof v.z === 'number') { zoom.value = v.z; panX.value = v.x; panY.value = v.y; return true }
  } catch { /* ignore */ }
  return false
}

const mmPerPx = computed(() => 1 / zoom.value)
const viewBox = computed(() =>
  `${panX.value} ${panY.value} ${sizePx.value.w * mmPerPx.value} ${sizePx.value.h * mmPerPx.value}`)

/** Пиксели → миллиметры при текущем зуме: размеры интерфейса задаём в px. */
function px(n: number) { return n * mmPerPx.value }

// на тачскрине цели крупнее — палец не мышь
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const HIT_VERTEX = coarse ? 26 : 18
const HIT_MID = coarse ? 24 : 16
const HIT_EDGE = coarse ? 26 : 16
const TAP_SLOP = coarse ? 8 : 4
const R_VERTEX = coarse ? 8 : 6
const R_MID = coarse ? 7 : 5

const vertexR = computed(() => px(R_VERTEX))
const midR = computed(() => px(R_MID))
const edgeW = computed(() => px(2))
const thinW = computed(() => px(1))
const fontMm = computed(() => px(coarse ? 14 : 13))

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const fillColor = computed(() => {
  const { r, g, b } = hexToRgb(filmColor(order.value.film))
  return `rgba(${r}, ${g}, ${b}, 0.22)`
})

function ptsStr(pts: { x: number; y: number }[]) { return pts.map((p) => `${p.x},${p.y}`).join(' ') }
function mid(a: Point, b: Point) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

function clientToMm(clientX: number, clientY: number) {
  const r = svgRef.value!.getBoundingClientRect()
  return {
    x: panX.value + (clientX - r.left) * mmPerPx.value,
    y: panY.value + (clientY - r.top) * mmPerPx.value,
  }
}

// ---- сетка ---------------------------------------------------------------
const gridLines = computed(() => {
  let step = settings.value.gridStep || 100
  while (step / mmPerPx.value < 6) step *= 5 // не рисуем «кашу» на мелком зуме
  if (!settings.value.showGrid) return { v: [] as number[], h: [] as number[], step }
  const w = sizePx.value.w * mmPerPx.value
  const h = sizePx.value.h * mmPerPx.value
  const v: number[] = []; const hh: number[] = []
  for (let x = Math.floor(panX.value / step) * step; x <= panX.value + w; x += step) v.push(x)
  for (let y = Math.floor(panY.value / step) * step; y <= panY.value + h; y += step) hh.push(y)
  return { v, h: hh, step }
})

// ---- видимость: спрятанные ярусы не рисуются и не ловят нажатия ---------
const visibleShapes = computed(() => shapesView.value.filter((sh) => sh.visible))
const visibleIds = computed(() => new Set(visibleShapes.value.map((sh) => sh.id)))
const visibleEdges = computed(() => edges.value.filter((e) => visibleIds.value.has(e.shapeId)))
const visiblePoints = computed(() => visibleShapes.value.flatMap((sh) => [...sh.points, ...sh.inner]))

/**
 * Подробности показываем только для активной фигуры: разбивка, углы и контур
 * усадки у всех разом превращают чертёж в кашу.
 */
const activeIds = computed(() => new Set(activeShape.value?.points.map((p) => p.id) ?? []))
const activeTriangles = computed(() => trianglesView.value.filter((t) => t.active))
const activeAngles = computed(() => angles.value.filter((a) => activeIds.value.has(a.id)))

// ---- стороны: прямые и скруглённые --------------------------------------
type XY = { x: number; y: number }

/** Точки стороны для отрисовки и попадания: дуга разложена по размеру на экране. */
function edgePoints(e: Edge): XY[] {
  if (!e.props.bulge) return [e.a, e.b]
  const onScreen = e.length / mmPerPx.value
  const steps = Math.max(8, Math.min(96, Math.round(onScreen / 5)))
  return [e.a, ...sampleArc(e.a, e.b, e.props.bulge, steps), e.b]
}
const edgeLines = computed(() => visibleEdges.value.map((e) => ({ edge: e, pts: edgePoints(e) })))

function pathOf(pts: XY[], close = false): string {
  if (!pts.length) return ''
  return 'M' + pts.map((p) => `${p.x},${p.y}`).join('L') + (close ? 'Z' : '')
}
/** Заливка полотна: внешний контур плюс вырезы (правило evenodd делает дыры). */
function fillPath(sh: { outline: XY[]; holes: XY[][] }): string {
  return [pathOf(sh.outline, true), ...sh.holes.map((h) => pathOf(h, true))].join(' ')
}

// ---- ручки середин сторон (врезать угол) --------------------------------
// Видны только у активной фигуры в «Выборе». На тачскрине нет наведения,
// поэтому «врезать угол» — видимая ручка, а не угаданный клик по стороне.
const handleEdges = computed(() => {
  if (tool.value !== 'select') return []
  const s = activeShape.value
  if (!s || s.points.length < 2) return []
  const minPx = coarse ? 76 : 54
  return activeEdges.value.filter((e) => e.length / mmPerPx.value > minPx)
})
/** Прямая сторона: ручка врезает новый угол. */
const midHandles = computed(() =>
  handleEdges.value.filter((e) => !e.props.bulge).map((e) => ({ key: e.key, ...mid(e.a, e.b) })))
/** Скруглённая сторона: ручка сидит на дуге и тянет кривизну. */
const arcHandles = computed(() =>
  handleEdges.value.filter((e) => e.props.bulge)
    .map((e) => ({ key: e.key, ...arcMidpoint(e.a, e.b, e.props.bulge) })))

// ---- hit-тест ------------------------------------------------------------
type Hit =
  | { kind: 'vertex'; id: string; shapeId: string }
  | { kind: 'mid'; key: string }
  | { kind: 'arc'; key: string }
  | { kind: 'edge'; key: string; shapeId: string }
  | { kind: 'shape'; shapeId: string }
  | { kind: 'empty' }

function distToSeg(p: { x: number; y: number }, a: Point, b: Point) {
  const abx = b.x - a.x; const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}
function pointInPoly(p: { x: number; y: number }, pts: Point[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]; const b = pts[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function hitTest(m: { x: number; y: number }): Hit {
  // в «Рисовать» на холсте доступна одна цель — замыкающая вершина
  if (tool.value === 'draw') {
    const s = activeShape.value
    if (s && !s.closed && s.points.length >= 3) {
      const f = s.points[0]
      if (Math.hypot(f.x - m.x, f.y - m.y) <= px(HIT_VERTEX)) return { kind: 'vertex', id: f.id, shapeId: s.id }
    }
    return { kind: 'empty' }
  }

  // 1. вершина (при наложении выигрывает активная фигура)
  let best: { id: string; shapeId: string; score: number } | null = null
  const thrV = px(HIT_VERTEX)
  for (const sh of visibleShapes.value) {
    for (const p of [...sh.points, ...sh.inner]) {
      const d = Math.hypot(p.x - m.x, p.y - m.y)
      if (d > thrV) continue
      const score = sh.active ? d - thrV : d
      if (!best || score < best.score) best = { id: p.id, shapeId: sh.id, score }
    }
  }
  if (best) return { kind: 'vertex', id: best.id, shapeId: best.shapeId }

  // 2. ручки на сторонах: кривизна и врезка угла
  const thrM = px(HIT_MID)
  for (const h of arcHandles.value) {
    if (Math.hypot(h.x - m.x, h.y - m.y) <= thrM) return { kind: 'arc', key: h.key }
  }
  for (const h of midHandles.value) {
    if (Math.hypot(h.x - m.x, h.y - m.y) <= thrM) return { kind: 'mid', key: h.key }
  }

  // 3. сторона (у скруглённой меряем расстояние до самой дуги)
  let bestE: { key: string; shapeId: string; d: number } | null = null
  const thrE = px(HIT_EDGE)
  for (const { edge, pts } of edgeLines.value) {
    let d = Infinity
    for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSeg(m, pts[i] as Point, pts[i + 1] as Point))
    if (d <= thrE && (!bestE || d < bestE.d)) bestE = { key: edge.key, shapeId: edge.shapeId, d }
  }
  if (bestE) return { kind: 'edge', key: bestE.key, shapeId: bestE.shapeId }

  // 4. заливка фигуры. Выигрывает САМАЯ МЕЛКАЯ фигура под курсором: иначе
  //    вложенный ярус или вырез не выбрать — их всегда перекрывает большое полотно.
  //    Сквозь собственный вырез клик проходит насквозь.
  let bestS: { id: string; area: number } | null = null
  for (const sh of visibleShapes.value) {
    if (!sh.closed || sh.outline.length < 3) continue
    if (!pointInPoly(m, sh.outline as Point[])) continue
    if (sh.holes.some((h) => pointInPoly(m, h as Point[]))) continue
    if (!bestS || sh.areaMm < bestS.area) bestS = { id: sh.id, area: sh.areaMm }
  }
  if (bestS) return { kind: 'shape', shapeId: bestS.id }
  return { kind: 'empty' }
}

// ---- привязка ------------------------------------------------------------
const guideX = ref<number | null>(null)
const guideY = ref<number | null>(null)
const weldTarget = ref<{ x: number; y: number; id: string } | null>(null)

/** Единая привязка: вершины → оси → 15° → шаг сетки. Один тумблер на всё. */
function snapDrag(id: string, m: { x: number; y: number }) {
  guideX.value = null; guideY.value = null; weldTarget.value = null
  if (!settings.value.snap) return { x: Math.round(m.x), y: Math.round(m.y) }

  const shape = activeShape.value
  const thr = px(coarse ? 20 : 14)

  // 1. чужая вершина: липнем, а для соседней по контуру предлагаем сварку
  let near: { p: Point; d: number } | null = null
  for (const p of visiblePoints.value) {
    if (p.id === id) continue
    const d = Math.hypot(p.x - m.x, p.y - m.y)
    if (d <= thr && (!near || d < near.d)) near = { p, d }
  }
  if (near) {
    const own = shape.points
    const i = own.findIndex((p) => p.id === id)
    const j = own.findIndex((p) => p.id === near!.p.id)
    const n = own.length
    if (i >= 0 && j >= 0 && (Math.abs(i - j) === 1 || Math.abs(i - j) === n - 1)) {
      weldTarget.value = { x: near.p.x, y: near.p.y, id: near.p.id }
    }
    return { x: near.p.x, y: near.p.y }
  }

  // 2. выравнивание по осям соседних вершин
  let x = m.x; let y = m.y
  let bx: number | null = null; let by: number | null = null
  for (const p of visiblePoints.value) {
    if (p.id === id) continue
    if (Math.abs(p.x - m.x) <= thr && (bx === null || Math.abs(p.x - m.x) < Math.abs(bx - m.x))) bx = p.x
    if (Math.abs(p.y - m.y) <= thr && (by === null || Math.abs(p.y - m.y) < Math.abs(by - m.y))) by = p.y
  }
  if (bx !== null) { x = bx; guideX.value = bx }
  if (by !== null) { y = by; guideY.value = by }

  // 3. угол кратно 15° от предыдущей вершины
  if (bx === null || by === null) {
    const idx = shape.points.findIndex((p) => p.id === id)
    const n = shape.points.length
    if (idx >= 0 && n >= 2) {
      const prev = shape.points[(idx - 1 + n) % n]
      const ang = Math.atan2(y - prev.y, x - prev.x)
      const step = Math.PI / 12
      const snapped = Math.round(ang / step) * step
      if (Math.abs(((ang - snapped + Math.PI) % (2 * Math.PI)) - Math.PI) < Math.PI / 36) {
        const len = Math.hypot(x - prev.x, y - prev.y)
        x = prev.x + Math.cos(snapped) * len
        y = prev.y + Math.sin(snapped) * len
      }
    }
  }

  // 4. шаг сетки — если ничего другого не сработало
  if (bx === null && by === null) {
    const g = settings.value.gridStep || 1
    x = Math.round(x / g) * g
    y = Math.round(y / g) * g
  }
  return { x: Math.round(x), y: Math.round(y) }
}

/** Привязка для новой точки — те же правила, что и при перетаскивании. */
function snapNew(m: { x: number; y: number }) {
  if (!settings.value.snap) return { x: Math.round(m.x), y: Math.round(m.y) }
  const thr = px(coarse ? 20 : 14)
  for (const p of visiblePoints.value) {
    if (Math.hypot(p.x - m.x, p.y - m.y) <= thr) return { x: p.x, y: p.y }
  }
  const g = settings.value.gridStep || 1
  return { x: Math.round(m.x / g) * g, y: Math.round(m.y / g) * g }
}

// ---- линейка -------------------------------------------------------------
const rulerPts = ref<{ x: number; y: number }[]>([])
const rulerDist = computed(() => rulerPts.value.length === 2
  ? Math.round(Math.hypot(rulerPts.value[0].x - rulerPts.value[1].x, rulerPts.value[0].y - rulerPts.value[1].y))
  : 0)

// ---- «резинка» при рисовании --------------------------------------------
const cursorMm = ref<{ x: number; y: number } | null>(null)
const drawTail = computed(() => {
  if (tool.value !== 'draw' || !cursorMm.value) return null
  const s = activeShape.value
  if (!s || !s.points.length || s.closed) return null
  return { a: s.points[s.points.length - 1], b: cursorMm.value }
})

// ---- вспомогательное для отрисовки --------------------------------------
const innerIds = computed(() => new Set(visibleShapes.value.flatMap((s) => s.inner.map((p) => p.id))))

function shapeLabel(sh: { id: string; points: Point[]; level: number }) {
  const pts = sh.points
  if (!pts.length) return { x: 0, y: 0, text: '' }
  let minX = Infinity; let minY = Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
  }
  const i = shapesView.value.findIndex((s) => s.id === sh.id)
  const tier = sh.level > 1 ? ` · ярус ${sh.level}` : ''
  // в левый верхний угол габарита: середина верхней стены занята размером
  return { x: minX, y: minY - px(18), text: `Фигура ${i + 1}${tier}` }
}

/** Центры фигур — нужны, чтобы отодвинуть подпись размера наружу. */
const shapeCenters = computed(() => {
  const m = new Map<string, { x: number; y: number }>()
  for (const sh of shapesView.value) {
    if (!sh.points.length) continue
    let x = 0; let y = 0
    for (const p of sh.points) { x += p.x; y += p.y }
    m.set(sh.id, { x: x / sh.points.length, y: y / sh.points.length })
  }
  return m
})

/**
 * Подпись длины стоит не на самой стороне, а снаружи от неё: середина
 * стороны занята ручкой «врезать угол», да и читается так привычнее.
 */
function edgeLabelPos(e: { shapeId: string; a: Point; b: Point }) {
  const m = mid(e.a, e.b)
  const dx = e.b.x - e.a.x; const dy = e.b.y - e.a.y
  const L = Math.hypot(dx, dy) || 1
  let nx = -dy / L; let ny = dx / L
  const c = shapeCenters.value.get(e.shapeId)
  if (c) {
    const inward = (m.x + nx - c.x) ** 2 + (m.y + ny - c.y) ** 2
    const outward = (m.x - nx - c.x) ** 2 + (m.y - ny - c.y) ** 2
    if (inward < outward) { nx = -nx; ny = -ny }
  }
  const off = px(13)
  // у вертикальной стены текст прижимаем краем — иначе он наползает на ручку
  const anchor = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'start' : 'end') : 'middle'
  return { x: m.x + nx * off, y: m.y + ny * off, anchor }
}

/** Готовые подписи длин — считаем один раз на перерисовку. */
const edgeLabels = computed(() => edges.value.map((e) => {
  const p = edgeLabelPos(e)
  return { key: e.key, x: p.x, y: p.y, anchor: p.anchor, text: Math.round(e.length) }
}))

function angleLabelPos(a: { id: string; cx: number; cy: number }) {
  const p = visiblePoints.value.find((q) => q.id === a.id)
  if (!p) return { x: 0, y: 0 }
  const dx = a.cx - p.x; const dy = a.cy - p.y
  const d = Math.hypot(dx, dy) || 1
  const off = px(26)
  return { x: p.x + (dx / d) * off, y: p.y + (dy / d) * off }
}
function isDrawStart(pid: string) {
  const s = activeShape.value
  return tool.value === 'draw' && !s.closed && s.points.length >= 3 && pid === s.points[0]?.id
}

// ---- жесты ---------------------------------------------------------------
type Press = {
  id: number
  hit: Hit
  cx: number; cy: number
  mm: { x: number; y: number }
  moved: boolean
  mode: 'undecided' | 'pan' | 'point' | 'edge' | 'shape' | 'arc'
  panX: number; panY: number
  aId?: string; bId?: string
  ax?: number; ay?: number; bx?: number; by?: number
  lastX?: number; lastY?: number
}
let press: Press | null = null
const pointers = new Map<number, { x: number; y: number }>()
let pinch: { dist: number; zoom: number } | null = null
let spaceDown = false

watch(tool, () => {
  guideX.value = null; guideY.value = null; weldTarget.value = null
  press = null
  cursorMm.value = null
  if (tool.value !== 'ruler') rulerPts.value = []
})
watch([zoom, panX, panY], saveViewDebounced)

function onPointerDown(ev: PointerEvent) {
  ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pointers.size === 2) { startPinch(); press = null; return }
  if (pointers.size > 2) return

  const mm = clientToMm(ev.clientX, ev.clientY)
  const hit: Hit = spaceDown || ev.button === 1 ? { kind: 'empty' } : hitTest(mm)
  press = {
    id: ev.pointerId, hit, cx: ev.clientX, cy: ev.clientY, mm,
    moved: false, mode: 'undecided', panX: panX.value, panY: panY.value,
  }
}

function beginDrag(p: Press) {
  // геометрию двигаем только в «Выборе»; в остальных режимах тяга = панорама
  if (tool.value !== 'select' || spaceDown) { p.mode = 'pan'; return }

  if (p.hit.kind === 'mid') {
    const id = store.insertOnEdge(p.hit.key) // ручка сразу становится вершиной
    if (!id) { p.mode = 'pan'; return }
    p.hit = { kind: 'vertex', id, shapeId: store.activeShapeId }
    p.mode = 'point'
    return
  }
  if (p.hit.kind === 'arc') {
    store.selectEdge(p.hit.key)
    store.snapshot()
    p.mode = 'arc'
    return
  }
  if (p.hit.kind === 'vertex') {
    store.selectPoint(p.hit.id)
    store.snapshot()
    p.mode = 'point'
    return
  }
  if (p.hit.kind === 'edge') {
    const e = edges.value.find((x) => x.key === (p.hit as { key: string }).key)
    if (!e) { p.mode = 'pan'; return }
    store.selectEdge(e.key)
    store.snapshot()
    p.mode = 'edge'
    p.aId = e.a.id; p.bId = e.b.id
    p.ax = e.a.x; p.ay = e.a.y; p.bx = e.b.x; p.by = e.b.y
    return
  }
  if (p.hit.kind === 'shape') {
    store.selectShape(p.hit.shapeId)
    store.snapshot()
    p.mode = 'shape'
    p.lastX = p.mm.x; p.lastY = p.mm.y
    return
  }
  p.mode = 'pan'
}

function onPointerMove(ev: PointerEvent) {
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pinch && pointers.size >= 2) { updatePinch(); return }

  if (!press) {
    if (tool.value === 'draw') cursorMm.value = clientToMm(ev.clientX, ev.clientY)
    return
  }
  if (ev.pointerId !== press.id) return

  if (!press.moved) {
    if (Math.hypot(ev.clientX - press.cx, ev.clientY - press.cy) < TAP_SLOP) return
    press.moved = true
    beginDrag(press)
  }

  const mm = clientToMm(ev.clientX, ev.clientY)
  if (press.mode === 'pan') {
    panX.value = press.panX - (ev.clientX - press.cx) * mmPerPx.value
    panY.value = press.panY - (ev.clientY - press.cy) * mmPerPx.value
  } else if (press.mode === 'point' && press.hit.kind === 'vertex') {
    const s = snapDrag(press.hit.id, mm)
    store.movePoint(press.hit.id, s.x, s.y, false, false)
  } else if (press.mode === 'edge') {
    const dx = mm.x - press.mm.x
    const dy = mm.y - press.mm.y
    store.movePoint(press.aId!, press.ax! + dx, press.ay! + dy, false, false)
    store.movePoint(press.bId!, press.bx! + dx, press.by! + dy, false, false)
  } else if (press.mode === 'arc' && press.hit.kind === 'arc') {
    const e = edges.value.find((x) => x.key === (press!.hit as { key: string }).key)
    if (e) store.setEdgeBulge(e.key, bulgeFromPoint(e.a, e.b, mm), false)
  } else if (press.mode === 'shape' && press.hit.kind === 'shape') {
    store.moveShape(press.hit.shapeId, mm.x - press.lastX!, mm.y - press.lastY!, false)
    press.lastX = mm.x; press.lastY = mm.y
  }
}

function onPointerUp(ev: PointerEvent) {
  pointers.delete(ev.pointerId)
  if (pointers.size < 2) pinch = null
  if (!press || ev.pointerId !== press.id) { if (!pointers.size) press = null; return }

  if (!press.moved) {
    onTap(press.hit, press.mm)
  } else {
    if (press.mode === 'point' && press.hit.kind === 'vertex' && weldTarget.value) {
      store.weldPoints(press.hit.id, weldTarget.value.id)
    }
    if (press.mode !== 'pan') store.commit()
  }
  guideX.value = null; guideY.value = null; weldTarget.value = null
  press = null
}

/** Тап без перетаскивания — единственное место, где что-то происходит по клику. */
function onTap(hit: Hit, mm: { x: number; y: number }) {
  if (tool.value === 'draw') {
    const s = activeShape.value
    if (hit.kind === 'vertex' && s.points.length >= 3 && hit.id === s.points[0].id) {
      store.finishDraw(true)
      return
    }
    const p = snapNew(mm)
    store.drawPoint(p.x, p.y, false)
    return
  }

  if (tool.value === 'ruler') {
    if (rulerPts.value.length >= 2) rulerPts.value = []
    rulerPts.value.push({ x: Math.round(mm.x), y: Math.round(mm.y) })
    return
  }

  if (tool.value === 'measure') {
    if (hit.kind === 'edge') store.setMeasureBase(hit.key)
    else if (hit.kind === 'shape' || hit.kind === 'vertex') store.selectShape(hit.shapeId)
    return
  }

  // «Выбор»
  if (hit.kind === 'vertex') store.selectPoint(hit.id)
  else if (hit.kind === 'edge') store.selectEdge(hit.key)
  else if (hit.kind === 'mid') store.insertOnEdge(hit.key)
  else if (hit.kind === 'arc') store.selectEdge(hit.key)
  else if (hit.kind === 'shape') store.selectShape(hit.shapeId)
  else store.clearSelection()
}

// ---- зум -----------------------------------------------------------------
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015))
}
function zoomAt(clientX: number, clientY: number, factor: number) {
  const rect = svgRef.value!.getBoundingClientRect()
  const sx = clientX - rect.left; const sy = clientY - rect.top
  const wx = panX.value + sx * mmPerPx.value
  const wy = panY.value + sy * mmPerPx.value
  zoom.value = Math.min(6, Math.max(0.005, zoom.value * factor))
  panX.value = wx - sx / zoom.value
  panY.value = wy - sy / zoom.value
}
function zoomBy(factor: number) {
  const r = svgRef.value!.getBoundingClientRect()
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
}
function startPinch() {
  const p = [...pointers.values()]
  pinch = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: zoom.value }
}
function updatePinch() {
  if (!pinch) return
  const p = [...pointers.values()]
  const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
  const cx = (p[0].x + p[1].x) / 2; const cy = (p[0].y + p[1].y) / 2
  const rect = svgRef.value!.getBoundingClientRect()
  const sx = cx - rect.left; const sy = cy - rect.top
  const wx = panX.value + sx * mmPerPx.value
  const wy = panY.value + sy * mmPerPx.value
  zoom.value = Math.min(6, Math.max(0.005, pinch.zoom * (dist / pinch.dist)))
  panX.value = wx - sx / zoom.value
  panY.value = wy - sy / zoom.value
}

// ---- вписать -------------------------------------------------------------
function fit() {
  const pts = visiblePoints.value.length ? visiblePoints.value : allPoints.value
  if (!pts.length) return
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const pad = Math.max(500, (maxX - minX) * 0.12)
  const w = maxX - minX + pad * 2; const h = maxY - minY + pad * 2
  const z = Math.min(sizePx.value.w / w, sizePx.value.h / h)
  if (!(z > 0) || !Number.isFinite(z)) return
  zoom.value = z
  // центрируем по обеим осям, иначе на узком экране чертёж липнет к краю
  panX.value = minX - pad - (sizePx.value.w / z - w) / 2
  panY.value = minY - pad - (sizePx.value.h / z - h) / 2
}
defineExpose({ fit, zoomBy })

// ---- пробел = временная «рука», как в Figma ------------------------------
function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !spaceDown && !isTyping(e.target)) { spaceDown = true; e.preventDefault() }
}
function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') spaceDown = false }

let ro: ResizeObserver | null = null
let pendingFit = false
onMounted(() => {
  const el = svgRef.value!
  ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    sizePx.value = { w: r.width, h: r.height }
    // вписываем только когда раскладка посчитана — иначе кадр уедет
    if (pendingFit) { pendingFit = false; fit() }
  })
  ro.observe(el)
  const r = el.getBoundingClientRect()
  if (r.width && r.height) sizePx.value = { w: r.width, h: r.height }
  if (!restoreView()) { pendingFit = true; if (r.width && r.height) { pendingFit = false; fit() } }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <svg
    ref="svgRef"
    :class="['canvas', 'tool-' + tool]"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
    @contextmenu.prevent
  >
    <!-- сетка -->
    <g v-if="settings.showGrid">
      <line v-for="x in gridLines.v" :key="'v' + x" :x1="x" :y1="panY" :x2="x"
        :y2="panY + sizePx.h * mmPerPx"
        :class="['grid', { major: Math.round(x) % (gridLines.step * 5) === 0 }]" :stroke-width="thinW" />
      <line v-for="y in gridLines.h" :key="'h' + y" :x1="panX" :y1="y"
        :x2="panX + sizePx.w * mmPerPx" :y2="y"
        :class="['grid', { major: Math.round(y) % (gridLines.step * 5) === 0 }]" :stroke-width="thinW" />
    </g>

    <!-- направляющие привязки -->
    <line v-if="guideX !== null" :x1="guideX" :y1="panY" :x2="guideX" :y2="panY + sizePx.h * mmPerPx"
      class="guide" :stroke-width="thinW" :stroke-dasharray="`${px(5)} ${px(5)}`" />
    <line v-if="guideY !== null" :x1="panX" :y1="guideY" :x2="panX + sizePx.w * mmPerPx" :y2="guideY"
      class="guide" :stroke-width="thinW" :stroke-dasharray="`${px(5)} ${px(5)}`" />

    <!-- фигуры: полотна с вырезами (evenodd) и незамкнутые контуры -->
    <g v-for="sh in visibleShapes" :key="sh.id">
      <polygon v-if="sh.active && sh.closed && sh.shrunk.length && sh.kind === 'ceiling'"
        :points="ptsStr(sh.shrunk)"
        class="shrink" :stroke-width="thinW" :stroke-dasharray="`${px(6)} ${px(6)}`" />
      <path v-if="sh.closed && sh.kind === 'ceiling'" :d="fillPath(sh)" fill-rule="evenodd"
        :fill="fillColor" stroke="none" :class="{ inactive: !sh.active }" />
      <path v-else-if="sh.closed" :d="pathOf(sh.outline, true)" class="hole-fill"
        :class="{ inactive: !sh.active }" />
      <path v-else-if="sh.points.length > 1" :d="pathOf(sh.points)" class="open-path"
        :stroke-width="edgeW" />
    </g>

    <!-- разбивка на треугольники -->
    <g v-if="settings.showTriangles">
      <g v-for="t in activeTriangles" :key="t.id">
        <polygon :points="ptsStr(t.pts)" class="tri" :stroke-width="thinW" />
        <line v-for="d in t.inner" :key="t.id + d.key" :x1="d.a.x" :y1="d.a.y" :x2="d.b.x" :y2="d.b.y"
          class="tri-diag" :stroke-width="thinW * 1.6" :stroke-dasharray="`${px(9)} ${px(6)}`" />
        <text :x="t.cx" :y="t.cy" class="tri-no" :font-size="fontMm * 0.95">△{{ t.no }}</text>
      </g>
    </g>

    <!-- предпросмотр пристраиваемого треугольника -->
    <polygon v-if="triPreview"
      :points="[triPreview.a, triPreview.b, triPreview.c].map((p) => p.x + ',' + p.y).join(' ')"
      :class="['tri-preview', { bad: !triPreview.ok, poor: triPreview.level === 'poor' }]" :stroke-width="edgeW"
      :stroke-dasharray="`${px(12)} ${px(7)}`" />

    <!-- стороны -->
    <path v-for="l in edgeLines" :key="l.edge.key" :d="pathOf(l.pts)" fill="none"
      :class="['edge', {
        sel: selectedEdgeKey === l.edge.key,
        base: measureBaseKey === l.edge.key,
        garpun: l.edge.props.garpun,
        seam: l.edge.props.seam,
      }]"
      :stroke-width="measureBaseKey === l.edge.key ? edgeW * 2.4 : (l.edge.props.seam ? edgeW * 1.8 : edgeW)"
      :stroke-dasharray="l.edge.props.seam ? `${px(10)} ${px(5)}` : undefined" />

    <!-- «резинка» при рисовании -->
    <line v-if="drawTail" :x1="drawTail.a.x" :y1="drawTail.a.y" :x2="drawTail.b.x" :y2="drawTail.b.y"
      class="tail" :stroke-width="thinW * 1.5" :stroke-dasharray="`${px(7)} ${px(5)}`" />

    <!-- размеры сторон -->
    <g v-if="settings.showMeasures">
      <text v-for="l in edgeLabels" :key="'t' + l.key" :x="l.x" :y="l.y" :text-anchor="l.anchor"
        class="measure" :font-size="fontMm">{{ l.text }}</text>
    </g>

    <!-- углы -->
    <g v-if="settings.showMeasures">
      <text v-for="a in activeAngles" :key="'a' + a.id" :x="angleLabelPos(a).x" :y="angleLabelPos(a).y"
        class="angle" :font-size="fontMm * 0.85">{{ a.deg }}°</text>
    </g>

    <!-- ручки кривизны на скруглённых сторонах -->
    <g v-for="h in arcHandles" :key="'a' + h.key">
      <circle :cx="h.x" :cy="h.y" :r="midR" class="arc-handle" :stroke-width="thinW * 1.5" />
    </g>

    <!-- ручки середин: врезать угол -->
    <g v-for="h in midHandles" :key="'m' + h.key">
      <circle :cx="h.x" :cy="h.y" :r="midR" class="mid-handle" :stroke-width="thinW * 1.5" />
      <line :x1="h.x - midR * 0.5" :y1="h.y" :x2="h.x + midR * 0.5" :y2="h.y" class="mid-plus" :stroke-width="thinW" />
      <line :x1="h.x" :y1="h.y - midR * 0.5" :x2="h.x" :y2="h.y + midR * 0.5" class="mid-plus" :stroke-width="thinW" />
    </g>

    <!-- вершины -->
    <circle v-for="p in visiblePoints" :key="p.id" :cx="p.x" :cy="p.y"
      :r="selectedPointId === p.id ? vertexR * 1.3 : vertexR"
      :class="['vertex', {
        sel: selectedPointId === p.id,
        start: isDrawStart(p.id),
        inner: innerIds.has(p.id),
      }]"
      :stroke-width="thinW * 1.5" />

    <!-- цель сварки -->
    <circle v-if="weldTarget" :cx="weldTarget.x" :cy="weldTarget.y" :r="vertexR * 2"
      class="weld" :stroke-width="thinW * 2" />

    <!-- какая фигура активна -->
    <template v-if="visibleShapes.length > 1">
      <text v-for="sh in visibleShapes.filter((s) => s.active)" :key="'lbl' + sh.id"
        :x="shapeLabel(sh).x" :y="shapeLabel(sh).y"
        class="shape-label on" :font-size="fontMm * 0.85">{{ shapeLabel(sh).text }}</text>
    </template>

    <!-- линейка -->
    <g v-if="rulerPts.length">
      <line v-if="rulerPts.length === 2" :x1="rulerPts[0].x" :y1="rulerPts[0].y"
        :x2="rulerPts[1].x" :y2="rulerPts[1].y" class="ruler" :stroke-width="edgeW"
        :stroke-dasharray="`${px(8)} ${px(4)}`" />
      <circle v-for="(r, i) in rulerPts" :key="'r' + i" :cx="r.x" :cy="r.y" :r="vertexR * 0.9"
        class="ruler-dot" :stroke-width="thinW" />
      <text v-if="rulerPts.length === 2" :x="(rulerPts[0].x + rulerPts[1].x) / 2"
        :y="(rulerPts[0].y + rulerPts[1].y) / 2 - px(14)" class="ruler-label"
        :font-size="fontMm">{{ rulerDist }} мм</text>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  width: 100%; height: 100%; display: block;
  background: var(--canvas-bg, #0f1420);
  touch-action: none; user-select: none;
}
/* попадание считаем сами — элементы курсор не перехватывают */
.canvas > * { pointer-events: none; }
.canvas.tool-select { cursor: default; }
.canvas.tool-draw, .canvas.tool-ruler, .canvas.tool-measure { cursor: crosshair; }

.grid { stroke: rgba(120, 150, 210, 0.07); }
.grid.major { stroke: rgba(120, 150, 210, 0.16); }
.inactive { opacity: 0.65; }
.open-path { fill: none; stroke: #5aa0ff; }
.shrink { fill: none; stroke: #ffb454; opacity: 0.8; }
.edge { stroke: #5aa0ff; stroke-linecap: round; }
.edge.garpun { stroke: #4fd08a; }
.edge.seam { stroke: #ff6b6b; }
.edge.sel { stroke: #ffd54a; }
.edge.base { stroke: #ffa726; }
.tail { stroke: #7fd6ff; opacity: 0.7; }
.measure { fill: #cbd5e1; dominant-baseline: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.6px; }
.angle { fill: #7fd6ff; text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.6px; }
.vertex { fill: #12203a; stroke: #5aa0ff; }
.vertex.sel { fill: #ffd54a; stroke: #ffd54a; }
.vertex.start { fill: #12331f; stroke: #4fd08a; }
.vertex.inner { fill: #0f1420; stroke: #7fd6ff; }
.weld { fill: none; stroke: #4fd08a; }
.mid-handle { fill: rgba(20, 32, 56, 0.9); stroke: #4a5f8a; }
.arc-handle { fill: rgba(255, 167, 38, 0.25); stroke: #ffa726; }
.hole-fill { fill: rgba(15, 20, 32, 0.85); stroke: none; }
.mid-plus { stroke: #9fb3d6; }
.guide { stroke: #ff5db1; opacity: 0.85; }
.tri { fill: rgba(127, 214, 255, 0.05); stroke: rgba(127, 214, 255, 0.18); }
.tri-diag { stroke: #7fd6ff; opacity: 0.65; }
.tri-no { fill: #7fd6ff; opacity: 0.75; text-anchor: middle; dominant-baseline: middle; }
.dim { opacity: 0.45; }
.tri-preview { fill: rgba(79, 208, 138, 0.18); stroke: #4fd08a; }
.tri-preview.bad { fill: rgba(255, 107, 107, 0.12); stroke: #ff6b6b; }
.tri-preview.poor { fill: rgba(255, 167, 38, 0.14); stroke: #ffa726; }
.shape-label { fill: #55637f; text-anchor: start; dominant-baseline: middle; }
.shape-label.on { fill: #9fc0ff; }
.ruler { stroke: #ff9f43; }
.ruler-dot { fill: #ff9f43; stroke: #fff; }
.ruler-label { fill: #ffd8a8; text-anchor: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.8px; }
</style>
