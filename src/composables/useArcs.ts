/**
 * Скруглённые стороны потолка.
 *
 * Кривизна стороны задаётся «выпуклостью» bulge = tan(θ/4), где θ — центральный
 * угол дуги (так же хранит дуги DXF). 0 — обычная прямая сторона, знак задаёт
 * сторону выгиба: положительный bulge выгибает дугу вправо от направления a→b.
 *
 * Почему именно bulge: стрелка дуги — то, что реально мерят на объекте
 * рулеткой от хорды до стены — равна ровно `хорда * bulge / 2`. То есть замер
 * «хорда + стрелка» переводится в модель без тригонометрии.
 */
import type { Point } from '../types'

export type XY = { x: number; y: number }

export interface ArcInfo {
  cx: number
  cy: number
  /** Радиус дуги, мм. */
  r: number
  /** Центральный угол со знаком, радианы. */
  theta: number
  /** Угол начала дуги от центра, радианы. */
  start: number
}

/** Геометрия дуги по концам и выпуклости; null — сторона прямая. */
export function arcInfo(a: XY, b: XY, bulge: number): ArcInfo | null {
  if (!bulge || !Number.isFinite(bulge)) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-6) return null
  const theta = 4 * Math.atan(bulge)
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2))
  // центр — на нормали к середине хорды; знак смещения даёт сторону выгиба
  const h = chord / 2 / Math.tan(theta / 2)
  const cx = (a.x + b.x) / 2 - (dy / chord) * h
  const cy = (a.y + b.y) / 2 + (dx / chord) * h
  return { cx, cy, r, theta, start: Math.atan2(a.y - cy, a.x - cx) }
}

/** Длина скруглённой стороны (дуги), мм. */
export function arcLength(a: XY, b: XY, bulge: number): number {
  const info = arcInfo(a, b, bulge)
  if (!info) return Math.hypot(b.x - a.x, b.y - a.y)
  return info.r * Math.abs(info.theta)
}

/** Стрелка дуги (высота сегмента от хорды), мм — её и мерят на объекте. */
export function arcSagitta(a: XY, b: XY, bulge: number): number {
  return (Math.hypot(b.x - a.x, b.y - a.y) * Math.abs(bulge)) / 2
}

/** Радиус скругления, мм; 0 — сторона прямая. */
export function arcRadius(a: XY, b: XY, bulge: number): number {
  const info = arcInfo(a, b, bulge)
  return info ? info.r : 0
}

/** Выпуклость по замеру «хорда + стрелка». */
export function bulgeFromSagitta(chord: number, sagitta: number): number {
  if (chord <= 0) return 0
  return (2 * sagitta) / chord
}

/** Выпуклость по радиусу; сторона выгиба задаётся знаком радиуса. */
export function bulgeFromRadius(chord: number, radius: number): number {
  const r = Math.abs(radius)
  if (chord <= 0 || r < chord / 2) return 0 // такой радиус хорду не стягивает
  const theta = 2 * Math.asin(chord / (2 * r))
  return Math.tan(theta / 4) * Math.sign(radius || 1)
}

/**
 * Промежуточные точки дуги (без концов). Число шагов задаёт вызывающий:
 * на экране — по длине дуги в пикселях, в расчётах — с запасом.
 */
export function sampleArc(a: XY, b: XY, bulge: number, steps: number): XY[] {
  const info = arcInfo(a, b, bulge)
  if (!info || steps < 2) return []
  const out: XY[] = []
  for (let i = 1; i < steps; i++) {
    const t = info.start + (info.theta * i) / steps
    out.push({ x: info.cx + info.r * Math.cos(t), y: info.cy + info.r * Math.sin(t) })
  }
  return out
}

/** Точка на дуге посередине — там сидит ручка скругления. */
export function arcMidpoint(a: XY, b: XY, bulge: number): XY {
  const info = arcInfo(a, b, bulge)
  if (!info) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const t = info.start + info.theta / 2
  return { x: info.cx + info.r * Math.cos(t), y: info.cy + info.r * Math.sin(t) }
}

/**
 * Выпуклость по точке, за которую тянут: сторона должна пройти через неё.
 * Знак берём из того, с какой стороны хорды оказалась точка.
 */
export function bulgeFromPoint(a: XY, b: XY, p: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-6) return 0
  // знаковое расстояние от точки до хорды
  const s = ((p.x - a.x) * dy - (p.y - a.y) * dx) / chord
  return Math.max(-4, Math.min(4, (2 * s) / chord))
}

/** Замкнутый контур в виде точек: дуги разложены на хорды. */
export function densify(
  points: Point[],
  closed: boolean,
  bulgeOf: (a: Point, b: Point) => number,
  steps = 48,
): XY[] {
  const n = points.length
  if (!n) return []
  const out: XY[] = []
  const lastEdge = closed ? n - 1 : n - 2
  for (let i = 0; i < n; i++) {
    const p = points[i]
    out.push({ x: p.x, y: p.y })
    if (i > lastEdge) continue
    const q = points[(i + 1) % n]
    const b = bulgeOf(p, q)
    if (b) out.push(...sampleArc(p, q, b, steps))
  }
  return out
}
