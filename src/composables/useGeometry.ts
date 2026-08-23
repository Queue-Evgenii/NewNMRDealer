import type { Point, Diagonal } from '../types'

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Signed polygon area via the shoelace formula; absolute value in mm². */
export function polygonArea(points: Point[]): number {
  const n = points.length
  if (n < 3) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const q = points[(i + 1) % n]
    sum += p.x * q.y - q.x * p.y
  }
  return Math.abs(sum) / 2
}

/** Perimeter of the closed polygon (mm). */
export function perimeter(points: Point[], closed: boolean): number {
  const n = points.length
  if (n < 2) return 0
  let total = 0
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    total += dist(points[i], points[(i + 1) % n])
  }
  return total
}

/** Centroid of the vertices (simple average — good enough for shrink preview). */
export function centroid(points: Point[]): Point {
  const n = points.length || 1
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { id: '_c', x: x / n, y: y / n }
}

/**
 * All diagonals between non-adjacent vertices of a closed polygon.
 * Mirrors the original "diag" / diagonal-check feature used to verify a build.
 */
export function diagonals(points: Point[]): Diagonal[] {
  const n = points.length
  const out: Diagonal[] = []
  if (n < 4) return out
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // skip the wrap-around adjacency (last <-> first)
      if (i === 0 && j === n - 1) continue
      out.push({
        fromId: points[i].id,
        toId: points[j].id,
        length: dist(points[i], points[j]),
      })
    }
  }
  return out
}

/**
 * Shrink (usad) preview: scale the contour toward its centroid so the cut film
 * is smaller than the room by the shrinkage coefficient. cut = real * (1 - usad/100).
 */
export function shrink(points: Point[], usadPercent: number): Point[] {
  const c = centroid(points)
  const k = 1 - usadPercent / 100
  return points.map((p) => ({
    id: p.id,
    x: c.x + (p.x - c.x) * k,
    y: c.y + (p.y - c.y) * k,
  }))
}

export function bounds(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

export function snapValue(v: number, step: number): number {
  return Math.round(v / step) * step
}

let seq = 0
export function newId(): string {
  seq += 1
  return `p${Date.now().toString(36)}${seq}`
}
