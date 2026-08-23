<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import type { Point } from '../types'

const store = useConfigurator()
const { points, edges, settings, selectedPointId, selectedEdgeKey, tool, closed, shrunk, angles } =
  storeToRefs(store)

// centroid (for angle-label placement)
const polyCentroid = computed(() => {
  if (!points.value.length) return { x: 0, y: 0 }
  let x = 0, y = 0
  for (const p of points.value) { x += p.x; y += p.y }
  return { x: x / points.value.length, y: y / points.value.length }
})
function angleLabelPos(p: { x: number; y: number }) {
  const c = polyCentroid.value
  const dx = c.x - p.x, dy = c.y - p.y
  const d = Math.hypot(dx, dy) || 1
  const off = 26 * mmPerPx.value
  return { x: p.x + (dx / d) * off, y: p.y + (dy / d) * off }
}

// ruler (Линейка) — two-click measure
const rulerPts = ref<Point[]>([])
const rulerDist = computed(() =>
  rulerPts.value.length === 2
    ? Math.round(Math.hypot(
        rulerPts.value[0].x - rulerPts.value[1].x,
        rulerPts.value[0].y - rulerPts.value[1].y))
    : 0,
)

const svgRef = ref<SVGSVGElement | null>(null)

// ---- view (pan / zoom) in mm --------------------------------------------
const zoom = ref(settings.value.pxPerMm) // px per mm
const panX = ref(-400) // mm at left edge
const panY = ref(-400) // mm at top edge
const sizePx = ref({ w: 800, h: 600 })

const mmPerPx = computed(() => 1 / zoom.value)
const viewBox = computed(() => {
  const w = sizePx.value.w * mmPerPx.value
  const h = sizePx.value.h * mmPerPx.value
  return `${panX.value} ${panY.value} ${w} ${h}`
})

// constant on-screen sizes -> mm
const handleR = computed(() => 7 * mmPerPx.value)
const edgeW = computed(() => 2 * mmPerPx.value)
const thinW = computed(() => 1 * mmPerPx.value)
const fontMm = computed(() => 13 * mmPerPx.value)

// ---- coordinate conversion ----------------------------------------------
function clientToMm(clientX: number, clientY: number): Point {
  const svg = svgRef.value!
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const m = svg.getScreenCTM()!.inverse()
  const p = pt.matrixTransform(m)
  return { id: '_', x: p.x, y: p.y }
}

// nearest existing vertex within a screen-pixel threshold (for snap/close)
const SNAP_PX = 16
function nearestVertex(m: Point, excludeId?: string) {
  const thr = SNAP_PX * mmPerPx.value
  let best: { id: string; x: number; y: number; d: number } | null = null
  for (const p of points.value) {
    if (p.id === excludeId) continue
    const d = Math.hypot(p.x - m.x, p.y - m.y)
    if (d <= thr && (!best || d < best.d)) best = { id: p.id, x: p.x, y: p.y, d }
  }
  return best
}

// ---- grid ----------------------------------------------------------------
const gridLines = computed(() => {
  if (!settings.value.showGrid) return { v: [], h: [] as number[] }
  const step = settings.value.gridStep
  const w = sizePx.value.w * mmPerPx.value
  const h = sizePx.value.h * mmPerPx.value
  const x0 = Math.floor(panX.value / step) * step
  const y0 = Math.floor(panY.value / step) * step
  const v: number[] = []
  const hh: number[] = []
  for (let x = x0; x <= panX.value + w; x += step) v.push(x)
  for (let y = y0; y <= panY.value + h; y += step) hh.push(y)
  return { v, h: hh }
})

const polygonPoints = computed(() =>
  points.value.map((p) => `${p.x},${p.y}`).join(' '),
)
const shrunkPoints = computed(() =>
  shrunk.value.map((p) => `${p.x},${p.y}`).join(' '),
)

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// ---- pointer interaction -------------------------------------------------
type Drag =
  | { kind: 'point'; id: string }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | null
let drag: Drag = null
const pointers = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; zoom: number; cx: number; cy: number } | null = null

function onPointerDownBg(ev: PointerEvent) {
  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

  if (pointers.size === 2) {
    startPinch()
    return
  }
  if (tool.value === 'add') {
    const m = clientToMm(ev.clientX, ev.clientY)
    const near = nearestVertex(m)
    if (near) {
      // clicked back onto an existing vertex: close the contour (make polотно)
      // if it's an endpoint of an open path, otherwise just select it.
      if (!closed.value && points.value.length >= 3) {
        store.toggleClosed()
        store.setTool('select')
      } else {
        store.selectPoint(near.id)
      }
      return
    }
    store.addPoint(m.x, m.y, selectedPointId.value ?? undefined)
    return
  }
  if (tool.value === 'ruler') {
    const m = clientToMm(ev.clientX, ev.clientY)
    if (rulerPts.value.length >= 2) rulerPts.value = []
    rulerPts.value.push({ id: '_r', x: Math.round(m.x), y: Math.round(m.y) })
    return
  }
  // pan (either pan tool, or select-tool on empty space)
  drag = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, panX: panX.value, panY: panY.value }
  store.selectPoint(null)
}

function onPointerDownPoint(ev: PointerEvent, id: string) {
  ev.stopPropagation()
  ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pointers.size === 2) {
    startPinch()
    return
  }
  store.selectPoint(id)
  if (tool.value !== 'pan') {
    store.snapshot()
    drag = { kind: 'point', id }
  }
}

function onPointerMove(ev: PointerEvent) {
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

  if (pinchStart && pointers.size >= 2) {
    updatePinch()
    return
  }
  if (!drag) return
  if (drag.kind === 'point') {
    const m = clientToMm(ev.clientX, ev.clientY)
    const near = nearestVertex(m, drag.id)
    if (near) { m.x = near.x; m.y = near.y } // snap onto another vertex
    store.movePoint(drag.id, m.x, m.y, false)
  } else if (drag.kind === 'pan') {
    const dx = (ev.clientX - drag.startX) * mmPerPx.value
    const dy = (ev.clientY - drag.startY) * mmPerPx.value
    panX.value = drag.panX - dx
    panY.value = drag.panY - dy
  }
}

function onPointerUp(ev: PointerEvent) {
  pointers.delete(ev.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) drag = null
}

// ---- zoom (wheel + pinch) ------------------------------------------------
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12
  zoomAt(ev.clientX, ev.clientY, factor)
}

function zoomAt(clientX: number, clientY: number, factor: number) {
  const before = clientToMm(clientX, clientY)
  zoom.value = Math.min(4, Math.max(0.01, zoom.value * factor))
  const after = clientToMm(clientX, clientY)
  panX.value += before.x - after.x
  panY.value += before.y - after.y
}

function startPinch() {
  const pts = [...pointers.values()]
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  pinchStart = {
    dist,
    zoom: zoom.value,
    cx: (pts[0].x + pts[1].x) / 2,
    cy: (pts[0].y + pts[1].y) / 2,
  }
  drag = null
}
function updatePinch() {
  if (!pinchStart) return
  const pts = [...pointers.values()]
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  const factor = dist / pinchStart.dist
  const cx = (pts[0].x + pts[1].x) / 2
  const cy = (pts[0].y + pts[1].y) / 2
  const before = clientToMm(cx, cy)
  zoom.value = Math.min(4, Math.max(0.01, pinchStart.zoom * factor))
  const after = clientToMm(cx, cy)
  panX.value += before.x - after.x
  panY.value += before.y - after.y
}

// ---- fit to content ------------------------------------------------------
function fit() {
  if (!points.value.length) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points.value) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const pad = 400
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  zoom.value = Math.min(sizePx.value.w / w, sizePx.value.h / h)
  panX.value = minX - pad
  panY.value = minY - pad
}
defineExpose({ fit })

// ---- resize observer -----------------------------------------------------
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = svgRef.value!
  ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect()
    sizePx.value = { w: r.width, h: r.height }
  })
  ro.observe(el)
  const r = el.getBoundingClientRect()
  sizePx.value = { w: r.width, h: r.height }
  fit()
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <svg
    ref="svgRef"
    class="canvas"
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
      <line
        v-for="x in gridLines.v"
        :key="'v' + x"
        :x1="x" :y1="panY" :x2="x"
        :y2="panY + sizePx.h * mmPerPx"
        :class="['grid', { major: Math.round(x) % (settings.gridStep * 5) === 0 }]"
        :stroke-width="thinW"
      />
      <line
        v-for="y in gridLines.h"
        :key="'h' + y"
        :x1="panX" :y1="y"
        :x2="panX + sizePx.w * mmPerPx" :y2="y"
        :class="['grid', { major: Math.round(y) % (settings.gridStep * 5) === 0 }]"
        :stroke-width="thinW"
      />
    </g>

    <!-- shrink (usad) preview -->
    <polygon
      v-if="closed && shrunkPoints"
      :points="shrunkPoints"
      class="shrink"
      :stroke-width="thinW"
      :stroke-dasharray="`${6 * mmPerPx} ${6 * mmPerPx}`"
    />

    <!-- filled ceiling -->
    <polygon v-if="closed" :points="polygonPoints" class="fill" />
    <polyline v-else :points="polygonPoints" class="fill-open" :stroke-width="edgeW" />

    <!-- edges (clickable, styled by garpun/seam) -->
    <g>
      <line
        v-for="e in edges"
        :key="e.key"
        :x1="e.a.x" :y1="e.a.y" :x2="e.b.x" :y2="e.b.y"
        :class="['edge', { sel: selectedEdgeKey === e.key, garpun: e.props.garpun, seam: e.props.seam }]"
        :stroke-width="e.props.seam ? edgeW * 1.8 : edgeW"
        :stroke-dasharray="e.props.seam ? `${10 * mmPerPx} ${5 * mmPerPx}` : undefined"
        @pointerdown.stop="store.selectEdge(e.key)"
      />
    </g>

    <!-- edge length labels -->
    <g v-if="settings.showMeasures">
      <text
        v-for="e in edges"
        :key="'t' + e.key"
        :x="midpoint(e.a, e.b).x"
        :y="midpoint(e.a, e.b).y"
        class="measure"
        :font-size="fontMm"
      >{{ Math.round(e.length) }}</text>
    </g>

    <!-- angle labels -->
    <g v-if="settings.showMeasures && closed">
      <text
        v-for="a in angles"
        :key="'a' + a.id"
        :x="angleLabelPos(points.find(p => p.id === a.id)!).x"
        :y="angleLabelPos(points.find(p => p.id === a.id)!).y"
        class="angle" :font-size="fontMm * 0.85"
      >{{ a.deg }}°</text>
    </g>

    <!-- vertices -->
    <g>
      <circle
        v-for="p in points"
        :key="p.id"
        :cx="p.x" :cy="p.y" :r="handleR"
        :class="['vertex', {
          sel: selectedPointId === p.id,
          start: !closed && points.length >= 3 && p.id === points[0]?.id,
        }]"
        :stroke-width="thinW * 1.5"
        @pointerdown="onPointerDownPoint($event, p.id)"
      />
    </g>

    <!-- ruler -->
    <g v-if="rulerPts.length">
      <line
        v-if="rulerPts.length === 2"
        :x1="rulerPts[0].x" :y1="rulerPts[0].y"
        :x2="rulerPts[1].x" :y2="rulerPts[1].y"
        class="ruler" :stroke-width="edgeW"
        :stroke-dasharray="`${8 * mmPerPx} ${4 * mmPerPx}`"
      />
      <circle v-for="(r, i) in rulerPts" :key="'r' + i"
        :cx="r.x" :cy="r.y" :r="handleR * 0.8" class="ruler-dot" :stroke-width="thinW" />
      <text v-if="rulerPts.length === 2"
        :x="(rulerPts[0].x + rulerPts[1].x) / 2"
        :y="(rulerPts[0].y + rulerPts[1].y) / 2 - 14 * mmPerPx"
        class="ruler-label" :font-size="fontMm">{{ rulerDist }} мм</text>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--canvas-bg, #0f1420);
  touch-action: none;
  cursor: crosshair;
}
.grid { stroke: rgba(120, 150, 210, 0.07); }
.grid.major { stroke: rgba(120, 150, 210, 0.16); }
.fill { fill: rgba(90, 160, 255, 0.12); stroke: none; }
.fill-open { fill: none; stroke: #5aa0ff; }
.shrink { fill: none; stroke: #ffb454; opacity: 0.8; }
.edge { stroke: #5aa0ff; cursor: pointer; }
.edge.garpun { stroke: #4fd08a; }
.edge.seam { stroke: #ff6b6b; }
.edge.sel { stroke: #ffd54a; }
.measure {
  fill: #cbd5e1;
  text-anchor: middle;
  dominant-baseline: middle;
  paint-order: stroke;
  stroke: #0f1420;
  stroke-width: 0.6px;
  user-select: none;
}
.vertex {
  fill: #12203a;
  stroke: #5aa0ff;
  cursor: grab;
}
.vertex.sel { fill: #ffd54a; stroke: #ffd54a; }
.vertex.start { fill: #12331f; stroke: #4fd08a; }
.angle {
  fill: #7fd6ff; text-anchor: middle; dominant-baseline: middle;
  paint-order: stroke; stroke: #0f1420; stroke-width: 0.6px; user-select: none;
}
.ruler { stroke: #ff9f43; }
.ruler-dot { fill: #ff9f43; stroke: #fff; }
.ruler-label {
  fill: #ffd8a8; text-anchor: middle; paint-order: stroke;
  stroke: #0f1420; stroke-width: 0.8px; user-select: none;
}
</style>
