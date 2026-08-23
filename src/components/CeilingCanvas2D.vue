<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { filmColor } from '../filmColors'
import type { Point } from '../types'

const store = useConfigurator()
const { shapesView, allPoints, edges, settings, selectedPointId, selectedEdgeKey, tool, angles, order, activeShape } =
  storeToRefs(store)

const svgRef = ref<SVGSVGElement | null>(null)

// ---- view (pan / zoom) in mm --------------------------------------------
const zoom = ref(settings.value.pxPerMm)
const panX = ref(-400)
const panY = ref(-400)
const sizePx = ref({ w: 800, h: 600 })

// remember view (zoom / pan) across reloads
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
const viewBox = computed(() => `${panX.value} ${panY.value} ${sizePx.value.w * mmPerPx.value} ${sizePx.value.h * mmPerPx.value}`)

const handleR = computed(() => 7 * mmPerPx.value)
const edgeW = computed(() => 2 * mmPerPx.value)
const thinW = computed(() => 1 * mmPerPx.value)
const fontMm = computed(() => 13 * mmPerPx.value)

// polygon fill colour is a fixed colour per film type (to show what's selected)
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

function ptsStr(pts: Point[]) { return pts.map((p) => `${p.x},${p.y}`).join(' ') }
function midpoint(a: Point, b: Point) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

// ---- coordinate conversion ----------------------------------------------
function clientToMm(clientX: number, clientY: number): Point {
  const svg = svgRef.value!
  const pt = svg.createSVGPoint()
  pt.x = clientX; pt.y = clientY
  const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
  return { id: '_', x: p.x, y: p.y }
}

// ---- grid ----------------------------------------------------------------
const gridLines = computed(() => {
  if (!settings.value.showGrid) return { v: [] as number[], h: [] as number[] }
  const step = settings.value.gridStep
  const w = sizePx.value.w * mmPerPx.value
  const h = sizePx.value.h * mmPerPx.value
  const v: number[] = []; const hh: number[] = []
  for (let x = Math.floor(panX.value / step) * step; x <= panX.value + w; x += step) v.push(x)
  for (let y = Math.floor(panY.value / step) * step; y <= panY.value + h; y += step) hh.push(y)
  return { v, h: hh }
})

// ---- snapping helpers ----------------------------------------------------
const SNAP_PX = 16
const EDGE_PX = 18
function nearestVertex(m: Point, excludeId?: string) {
  const thr = SNAP_PX * mmPerPx.value
  let best: { id: string; x: number; y: number; d: number } | null = null
  for (const p of allPoints.value) {
    if (p.id === excludeId) continue
    const d = Math.hypot(p.x - m.x, p.y - m.y)
    if (d <= thr && (!best || d < best.d)) best = { id: p.id, x: p.x, y: p.y, d }
  }
  return best
}
function projectOnSeg(p: Point, a: Point, b: Point) {
  const abx = b.x - a.x, aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  const x = a.x + abx * t, y = a.y + aby * t
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) }
}
function nearestEdge(m: Point) {
  const thr = EDGE_PX * mmPerPx.value
  let best: { afterId: string; x: number; y: number; d: number } | null = null
  for (const e of edges.value) {
    const pr = projectOnSeg(m, e.a, e.b)
    if (pr.t <= 0.02 || pr.t >= 0.98) continue
    if (pr.d <= thr && (!best || pr.d < best.d)) best = { afterId: e.a.id, x: pr.x, y: pr.y, d: pr.d }
  }
  return best
}

const guideX = ref<number | null>(null)
const guideY = ref<number | null>(null)
function smartSnap(id: string, m: Point): { x: number; y: number } {
  guideX.value = null; guideY.value = null
  const v = nearestVertex(m, id)
  if (v) return { x: v.x, y: v.y }
  if (!settings.value.snap) return { x: Math.round(m.x), y: Math.round(m.y) }
  const thr = SNAP_PX * mmPerPx.value
  let x = m.x, y = m.y
  let bx: number | null = null, by: number | null = null
  for (const p of allPoints.value) {
    if (p.id === id) continue
    if (Math.abs(p.x - m.x) <= thr && (bx === null || Math.abs(p.x - m.x) < Math.abs(bx - m.x))) bx = p.x
    if (Math.abs(p.y - m.y) <= thr && (by === null || Math.abs(p.y - m.y) < Math.abs(by - m.y))) by = p.y
  }
  if (bx !== null) { x = bx; guideX.value = bx }
  if (by !== null) { y = by; guideY.value = by }
  if (bx === null || by === null) {
    const shape = activeShape.value
    const idx = shape.points.findIndex((p) => p.id === id)
    const n = shape.points.length
    if (idx >= 0 && n >= 2) {
      const prev = shape.points[(idx - 1 + n) % n]
      const ang = Math.atan2(y - prev.y, x - prev.x)
      const step = Math.PI / 12
      const snapAng = Math.round(ang / step) * step
      const diff = ((ang - snapAng + Math.PI) % (2 * Math.PI)) - Math.PI
      if (Math.abs(diff) < Math.PI / 36) {
        const len = Math.hypot(x - prev.x, y - prev.y)
        x = prev.x + Math.cos(snapAng) * len
        y = prev.y + Math.sin(snapAng) * len
      }
    }
  }
  return { x: Math.round(x), y: Math.round(y) }
}

// ---- misc overlays -------------------------------------------------------
const hoverBend = ref<{ x: number; y: number } | null>(null)
function angleLabelPos(a: { id: string; cx: number; cy: number }) {
  const p = allPoints.value.find((q) => q.id === a.id)
  if (!p) return { x: 0, y: 0 }
  const dx = a.cx - p.x, dy = a.cy - p.y
  const d = Math.hypot(dx, dy) || 1
  const off = 26 * mmPerPx.value
  return { x: p.x + (dx / d) * off, y: p.y + (dy / d) * off }
}
const rulerPts = ref<Point[]>([])
const rulerDist = computed(() => rulerPts.value.length === 2
  ? Math.round(Math.hypot(rulerPts.value[0].x - rulerPts.value[1].x, rulerPts.value[0].y - rulerPts.value[1].y)) : 0)

// ---- pointer interaction -------------------------------------------------
type Drag =
  | { kind: 'point'; id: string; startX: number; startY: number; started: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'edge'; aId: string; bId: string; ax: number; ay: number; bx: number; by: number; startX: number; startY: number }
  | null
let drag: Drag = null
const pointers = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; zoom: number } | null = null

watch(tool, () => { guideX.value = null; guideY.value = null })
watch([zoom, panX, panY], saveViewDebounced)

function onPointerDownBg(ev: PointerEvent) {
  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pointers.size === 2) { startPinch(); return }

  if (tool.value === 'add') {
    const m = clientToMm(ev.clientX, ev.clientY)
    const s = activeShape.value
    const thr = SNAP_PX * mmPerPx.value

    if (!s.closed) {
      // DRAWING the active open contour ------------------------------------
      // close it by clicking back on its own first point
      if (s.points.length >= 3) {
        const f = s.points[0]
        if (Math.hypot(m.x - f.x, m.y - f.y) <= thr) {
          store.toggleClosed()
          store.setTool('select')
          return
        }
      }
      // attach: snap the new point onto an existing vertex …
      const nv = nearestVertex(m)
      if (nv) { store.addPoint(nv.x, nv.y, undefined, false); return }
      // … or onto an existing side
      const ne = nearestEdge(m)
      if (ne) { store.addPoint(ne.x, ne.y, undefined, false); return }
      // otherwise a free point
      store.addPoint(m.x, m.y)
      return
    }

    // EDITING a closed active contour --------------------------------------
    const nv = nearestVertex(m)
    if (nv) { store.selectPoint(nv.id); return }        // pick a vertex
    const ne = nearestEdge(m)
    if (ne) { store.addPoint(ne.x, ne.y, ne.afterId, false); return } // bend on side
    store.startShape(m.x, m.y)                          // empty → new independent contour
    return
  }

  if (tool.value === 'ruler') {
    const m = clientToMm(ev.clientX, ev.clientY)
    if (rulerPts.value.length >= 2) rulerPts.value = []
    rulerPts.value.push({ id: '_r', x: Math.round(m.x), y: Math.round(m.y) })
    return
  }

  drag = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, panX: panX.value, panY: panY.value }
  store.selectPoint(null)
}

function onPointerDownPoint(ev: PointerEvent, id: string) {
  ev.stopPropagation()
  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pointers.size === 2) { startPinch(); return }
  if (tool.value === 'pan') {
    drag = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, panX: panX.value, panY: panY.value }
    return
  }
  // while drawing an open contour, a vertex click attaches/closes — hand to bg logic
  if (tool.value === 'add' && !activeShape.value.closed) { onPointerDownBg(ev); return }
  // otherwise (select tool, or add-mode on a closed shape): select + allow drag.
  // snapshot is deferred until the pointer actually moves (so a click stays a click).
  store.selectPoint(id)
  drag = { kind: 'point', id, startX: ev.clientX, startY: ev.clientY, started: false }
}

function onPointerDownEdge(ev: PointerEvent, e: { key: string; a: Point; b: Point }) {
  if (tool.value !== 'select') return
  ev.stopPropagation()
  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pointers.size === 2) { startPinch(); return }
  store.selectEdge(e.key)
  store.snapshot()
  drag = { kind: 'edge', aId: e.a.id, bId: e.b.id, ax: e.a.x, ay: e.a.y, bx: e.b.x, by: e.b.y, startX: ev.clientX, startY: ev.clientY }
}

function onPointerMove(ev: PointerEvent) {
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pinchStart && pointers.size >= 2) { updatePinch(); return }

  if (!drag && tool.value === 'add') {
    const m = clientToMm(ev.clientX, ev.clientY)
    hoverBend.value = nearestVertex(m) ? null : nearestEdge(m)
  } else if (hoverBend.value) { hoverBend.value = null }

  if (!drag) return
  if (drag.kind === 'point') {
    if (!drag.started) {
      if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 3) return // still a click
      drag.started = true
      store.snapshot()
    }
    const s = smartSnap(drag.id, clientToMm(ev.clientX, ev.clientY))
    store.movePoint(drag.id, s.x, s.y, false, false)
  } else if (drag.kind === 'edge') {
    const dx = (ev.clientX - drag.startX) * mmPerPx.value
    const dy = (ev.clientY - drag.startY) * mmPerPx.value
    store.movePoint(drag.aId, drag.ax + dx, drag.ay + dy, false, false)
    store.movePoint(drag.bId, drag.bx + dx, drag.by + dy, false, false)
  } else if (drag.kind === 'pan') {
    panX.value = drag.panX - (ev.clientX - drag.startX) * mmPerPx.value
    panY.value = drag.panY - (ev.clientY - drag.startY) * mmPerPx.value
  }
}

function onPointerUp(ev: PointerEvent) {
  pointers.delete(ev.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) {
    // a vertex press that never moved is a click: in add mode it can close the contour
    if (drag && drag.kind === 'point' && !drag.started && tool.value === 'add') {
      const s = activeShape.value
      if (!s.closed && s.points.length >= 3 && drag.id === s.points[0]?.id) {
        store.toggleClosed()
        store.setTool('select')
      }
    }
    drag = null
    guideX.value = null
    guideY.value = null
  }
}

// ---- zoom (cursor-anchored, math-based) ----------------------------------
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015))
}
function zoomAt(clientX: number, clientY: number, factor: number) {
  const rect = svgRef.value!.getBoundingClientRect()
  const px = clientX - rect.left, py = clientY - rect.top
  const worldX = panX.value + px * mmPerPx.value
  const worldY = panY.value + py * mmPerPx.value
  zoom.value = Math.min(4, Math.max(0.01, zoom.value * factor))
  panX.value = worldX - px / zoom.value
  panY.value = worldY - py / zoom.value
}
function startPinch() {
  const p = [...pointers.values()]
  pinchStart = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: zoom.value }
  drag = null
}
function updatePinch() {
  if (!pinchStart) return
  const p = [...pointers.values()]
  const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
  const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2
  const rect = svgRef.value!.getBoundingClientRect()
  const px = cx - rect.left, py = cy - rect.top
  const worldX = panX.value + px * mmPerPx.value
  const worldY = panY.value + py * mmPerPx.value
  zoom.value = Math.min(4, Math.max(0.01, pinchStart.zoom * (dist / pinchStart.dist)))
  panX.value = worldX - px / zoom.value
  panY.value = worldY - py / zoom.value
}

// ---- fit -----------------------------------------------------------------
function fit() {
  const pts = allPoints.value
  if (!pts.length) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  const pad = 400
  const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2
  zoom.value = Math.min(sizePx.value.w / w, sizePx.value.h / h)
  panX.value = minX - pad; panY.value = minY - pad
}
defineExpose({ fit })

let ro: ResizeObserver | null = null
onMounted(() => {
  const el = svgRef.value!
  ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); sizePx.value = { w: r.width, h: r.height } })
  ro.observe(el)
  const r = el.getBoundingClientRect(); sizePx.value = { w: r.width, h: r.height }
  if (!restoreView()) fit() // restore saved zoom/pan, else frame the drawing
})
onBeforeUnmount(() => ro?.disconnect())

function isStart(pid: string) {
  const s = activeShape.value
  return !s.closed && s.points.length >= 3 && pid === s.points[0]?.id
}
</script>

<template>
  <svg
    ref="svgRef"
    :class="['canvas', 'tool-' + tool]"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    @pointerdown="onPointerDownBg"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <!-- grid -->
    <g v-if="settings.showGrid">
      <line v-for="x in gridLines.v" :key="'v' + x" :x1="x" :y1="panY" :x2="x"
        :y2="panY + sizePx.h * mmPerPx" :class="['grid', { major: Math.round(x) % (settings.gridStep * 5) === 0 }]" :stroke-width="thinW" />
      <line v-for="y in gridLines.h" :key="'h' + y" :x1="panX" :y1="y"
        :x2="panX + sizePx.w * mmPerPx" :y2="y" :class="['grid', { major: Math.round(y) % (settings.gridStep * 5) === 0 }]" :stroke-width="thinW" />
    </g>

    <!-- alignment guides -->
    <line v-if="guideX !== null" :x1="guideX" :y1="panY" :x2="guideX" :y2="panY + sizePx.h * mmPerPx"
      class="guide" :stroke-width="thinW" :stroke-dasharray="`${5 * mmPerPx} ${5 * mmPerPx}`" />
    <line v-if="guideY !== null" :x1="panX" :y1="guideY" :x2="panX + sizePx.w * mmPerPx" :y2="guideY"
      class="guide" :stroke-width="thinW" :stroke-dasharray="`${5 * mmPerPx} ${5 * mmPerPx}`" />

    <!-- shapes -->
    <g v-for="sh in shapesView" :key="sh.id">
      <polygon v-if="sh.closed && sh.shrunk.length" :points="ptsStr(sh.shrunk)" class="shrink"
        :stroke-width="thinW" :stroke-dasharray="`${6 * mmPerPx} ${6 * mmPerPx}`" />
      <polygon v-if="sh.closed" :points="ptsStr(sh.points)" :fill="fillColor" stroke="none"
        :class="{ inactive: !sh.active }" />
      <polyline v-else :points="ptsStr(sh.points)" class="fill-open" :stroke-width="edgeW" />
    </g>

    <!-- edges: wide transparent hit-line (grab to move) + visible styled line -->
    <g>
      <template v-for="e in edges" :key="e.key">
        <line :x1="e.a.x" :y1="e.a.y" :x2="e.b.x" :y2="e.b.y" class="edge-hit"
          :stroke-width="16 * mmPerPx" @pointerdown="onPointerDownEdge($event, e)" />
        <line :x1="e.a.x" :y1="e.a.y" :x2="e.b.x" :y2="e.b.y"
          :class="['edge', { sel: selectedEdgeKey === e.key, garpun: e.props.garpun, seam: e.props.seam }]"
          :stroke-width="e.props.seam ? edgeW * 1.8 : edgeW"
          :stroke-dasharray="e.props.seam ? `${10 * mmPerPx} ${5 * mmPerPx}` : undefined" />
      </template>
    </g>

    <!-- edge length labels -->
    <g v-if="settings.showMeasures">
      <text v-for="e in edges" :key="'t' + e.key" :x="midpoint(e.a, e.b).x" :y="midpoint(e.a, e.b).y"
        class="measure" :font-size="fontMm">{{ Math.round(e.length) }}</text>
    </g>

    <!-- angle labels -->
    <g v-if="settings.showMeasures">
      <text v-for="a in angles" :key="'a' + a.id" :x="angleLabelPos(a).x" :y="angleLabelPos(a).y"
        class="angle" :font-size="fontMm * 0.85">{{ a.deg }}°</text>
    </g>

    <!-- bend insert preview -->
    <circle v-if="hoverBend" :cx="hoverBend.x" :cy="hoverBend.y" :r="handleR * 0.9"
      class="bend-preview" :stroke-width="thinW * 1.5" />

    <!-- vertices -->
    <g>
      <circle v-for="p in allPoints" :key="p.id" :cx="p.x" :cy="p.y" :r="handleR"
        :class="['vertex', { sel: selectedPointId === p.id, start: isStart(p.id) }]"
        :stroke-width="thinW * 1.5" @pointerdown="onPointerDownPoint($event, p.id)" />
    </g>

    <!-- ruler -->
    <g v-if="rulerPts.length">
      <line v-if="rulerPts.length === 2" :x1="rulerPts[0].x" :y1="rulerPts[0].y" :x2="rulerPts[1].x" :y2="rulerPts[1].y"
        class="ruler" :stroke-width="edgeW" :stroke-dasharray="`${8 * mmPerPx} ${4 * mmPerPx}`" />
      <circle v-for="(r, i) in rulerPts" :key="'r' + i" :cx="r.x" :cy="r.y" :r="handleR * 0.8" class="ruler-dot" :stroke-width="thinW" />
      <text v-if="rulerPts.length === 2" :x="(rulerPts[0].x + rulerPts[1].x) / 2"
        :y="(rulerPts[0].y + rulerPts[1].y) / 2 - 14 * mmPerPx" class="ruler-label" :font-size="fontMm">{{ rulerDist }} мм</text>
    </g>
  </svg>
</template>

<style scoped>
.canvas { width: 100%; height: 100%; display: block; background: var(--canvas-bg, #0f1420); touch-action: none; }
.canvas.tool-select { cursor: default; }
.canvas.tool-add { cursor: crosshair; }
.canvas.tool-ruler { cursor: crosshair; }
.canvas.tool-pan { cursor: grab; }
.canvas.tool-pan:active { cursor: grabbing; }
.grid { stroke: rgba(120, 150, 210, 0.07); }
.grid.major { stroke: rgba(120, 150, 210, 0.16); }
.inactive { opacity: 0.7; }
.fill-open { fill: none; stroke: #5aa0ff; }
.shrink { fill: none; stroke: #ffb454; opacity: 0.8; }
.edge { stroke: #5aa0ff; pointer-events: none; }
.edge.garpun { stroke: #4fd08a; }
.edge.seam { stroke: #ff6b6b; }
.edge.sel { stroke: #ffd54a; }
.edge-hit { stroke: transparent; }
.tool-select .edge-hit { cursor: move; }
.tool-add .edge-hit { cursor: crosshair; }
.measure { fill: #cbd5e1; text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.6px; user-select: none; }
.angle { fill: #7fd6ff; text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.6px; user-select: none; }
.vertex { fill: #12203a; stroke: #5aa0ff; cursor: move; }
.vertex.sel { fill: #ffd54a; stroke: #ffd54a; }
.vertex.start { fill: #12331f; stroke: #4fd08a; }
.bend-preview { fill: rgba(127, 214, 255, 0.25); stroke: #7fd6ff; pointer-events: none; }
.guide { stroke: #ff5db1; opacity: 0.8; pointer-events: none; }
.ruler { stroke: #ff9f43; }
.ruler-dot { fill: #ff9f43; stroke: #fff; }
.ruler-label { fill: #ffd8a8; text-anchor: middle; paint-order: stroke; stroke: #0f1420; stroke-width: 0.8px; user-select: none; }
</style>
