// Метод треугольников (триангуляция замера).
//
// Замерщик не может померить углы — он меряет только длины: стороны комнаты
// и диагонали, которые разбивают её на треугольники. Треугольник по трём
// сторонам (SSS) строится однозначно, поэтому весь контур восстанавливается
// цепочкой треугольников: каждый следующий прикладывается к уже построенной
// стороне наружу. Треугольники при этом не пересекаются — это проверяется
// здесь (properIntersect / trianglesOverlap).
//
// Все размеры — миллиметры, как и весь остальной конструктор.

export type XY = { x: number; y: number }

/** Вершина ближе этого расстояния к существующей — «приваривается» к ней. */
export const WELD_TOL = 25
/** Заход одной фигуры в другую глубже этого — считаем пересечением. */
export const INSIDE_TOL = 1

/** Удвоенная знаковая площадь o→a→b (>0 — поворот влево). */
export function cross3(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Знаковое расстояние (мм) от p до прямой u→v; положительное — слева. */
function sideDist(p: XY, u: XY, v: XY): number {
  const L = Math.hypot(v.x - u.x, v.y - u.y) || 1
  return cross3(u, v, p) / L
}

/** Насколько глубоко (мм) точка внутри треугольника; >0 — строго внутри. */
export function insideDepth(p: XY, a: XY, b: XY, c: XY): number {
  const s = cross3(a, b, c) >= 0 ? 1 : -1
  return Math.min(s * sideDist(p, a, b), s * sideDist(p, b, c), s * sideDist(p, c, a))
}

export function pointInTri(p: XY, a: XY, b: XY, c: XY, tol = INSIDE_TOL): boolean {
  return insideDepth(p, a, b, c) > tol
}

export function triCentroid(a: XY, b: XY, c: XY): XY {
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }
}

/** Площадь треугольника по трём сторонам (Герон), мм². */
export function heronArea(a: number, b: number, c: number): number {
  const s = (a + b + c) / 2
  const v = s * (s - a) * (s - b) * (s - c)
  return v > 0 ? Math.sqrt(v) : 0
}

/**
 * Угол при вершине, которую засекают двумя рулетками (напротив основания).
 * Теорема косинусов: base — основание, fromA/fromB — стороны до новой вершины.
 */
export function apexAngleDeg(base: number, fromA: number, fromB: number): number {
  const cos = (fromA * fromA + fromB * fromB - base * base) / (2 * fromA * fromB)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/**
 * Насколько ошибка рулетки размазывается по положению вершины.
 * Две дуги пересекаются под углом при вершине: чем он острее (или тупее),
 * тем длиннее «веретено» пересечения. Коэффициент = 1/sin(угол):
 * 90° → ×1.0, 30° → ×2.0, 15° → ×3.9, 5° → ×11.5.
 */
export function errorFactor(angleDeg: number): number {
  const s = Math.sin((angleDeg * Math.PI) / 180)
  return s > 1e-6 ? 1 / s : Infinity
}

export type Quality = 'good' | 'fair' | 'poor'

/**
 * Оценка засечки. Угол складываем к острому: дуги, сходящиеся под 168°,
 * так же ненадёжны, как под 12° — «веретено» пересечения одинаково длинное.
 */
export function quality(angleDeg: number): Quality {
  const a = Math.min(angleDeg, 180 - angleDeg)
  if (a < 20) return 'poor'
  if (a < 30) return 'fair'
  return 'good'
}

/** Три угла треугольника по трём сторонам, градусы. */
export function triangleAngles(a: number, b: number, c: number): [number, number, number] {
  return [apexAngleDeg(a, b, c), apexAngleDeg(b, a, c), apexAngleDeg(c, a, b)]
}

/** Проверка «неравенства треугольника»; null — треугольник существует. */
export function triangleError(a: number, b: number, c: number): string | null {
  if (![a, b, c].every((v) => Number.isFinite(v) && v > 0)) {
    return 'Все три стороны должны быть больше нуля'
  }
  const slack = Math.min(a + b - c, a + c - b, b + c - a)
  if (slack <= 0) return 'Такого треугольника не существует: сумма двух сторон должна быть больше третьей'
  if (slack < 1) return 'Треугольник вырожденный — стороны почти на одной линии'
  return null
}

/**
 * Засечка (трилатерация): вершина на расстоянии dA от A и dB от B.
 * side = +1 — слева от A→B, -1 — справа.
 */
export function apexFrom(A: XY, B: XY, dA: number, dB: number, side: 1 | -1): XY | null {
  const d = Math.hypot(B.x - A.x, B.y - A.y)
  if (d < 1e-6) return null
  if (dA + dB <= d || Math.abs(dA - dB) >= d) return null // окружности не пересекаются
  const t = (dA * dA - dB * dB + d * d) / (2 * d)
  const h2 = dA * dA - t * t
  if (h2 <= 0) return null
  const h = Math.sqrt(h2)
  const ux = (B.x - A.x) / d
  const uy = (B.y - A.y) / d
  const mx = A.x + ux * t
  const my = A.y + uy * t
  // нормаль (-uy, ux) даёт cross3(A, B, P) > 0, т.е. side = +1
  return { x: mx - uy * h * side, y: my + ux * h * side }
}

/** Строгое пересечение отрезков: общие концы и касания не считаются. */
export function properIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = cross3(p3, p4, p1)
  const d2 = cross3(p3, p4, p2)
  const d3 = cross3(p1, p2, p3)
  const d4 = cross3(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * Пересекаются ли треугольники по площади.
 * Общая сторона или общая вершина — не пересечение (так они и стыкуются).
 */
export function trianglesOverlap(t1: XY[], t2: XY[]): boolean {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (properIntersect(t1[i], t1[(i + 1) % 3], t2[j], t2[(j + 1) % 3])) return true
    }
  }
  if (pointInTri(triCentroid(t1[0], t1[1], t1[2]), t2[0], t2[1], t2[2])) return true
  if (pointInTri(triCentroid(t2[0], t2[1], t2[2]), t1[0], t1[1], t1[2])) return true
  for (const p of t1) if (pointInTri(p, t2[0], t2[1], t2[2])) return true
  for (const p of t2) if (pointInTri(p, t1[0], t1[1], t1[2])) return true
  return false
}

/** Знаковая удвоенная площадь замкнутого контура. */
export function signedArea2(pts: XY[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return s
}

/** Наименьший угол треугольника по координатам, градусы. */
export function minAngleOf(a: XY, b: XY, c: XY): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y)
  const bc = Math.hypot(c.x - b.x, c.y - b.y)
  const ca = Math.hypot(a.x - c.x, a.y - c.y)
  if (ab < 1e-6 || bc < 1e-6 || ca < 1e-6) return 0
  return Math.min(...triangleAngles(ab, bc, ca))
}

/**
 * Ear clipping: разбивает простой многоугольник (в т.ч. невыпуклый) на
 * непересекающиеся треугольники. Возвращает тройки индексов исходного массива.
 *
 * Ухо выбирается не первое попавшееся, а самое «толстое» (с наибольшим
 * минимальным углом). Наивный вариант срезает уши подряд у одной вершины и
 * выдаёт веер из длинных узких треугольников — для замера это худший случай:
 * все диагонали из одного угла и почти вдоль стен.
 */
export function earClip(pts: XY[]): [number, number, number][] {
  const n = pts.length
  if (n < 3) return []
  const idx = [...Array(n).keys()]
  if (signedArea2(pts) < 0) idx.reverse() // работаем в положительном обходе
  const out: [number, number, number][] = []
  let guard = n * n + 16
  while (idx.length > 2 && guard-- > 0) {
    let best: { at: number; tri: [number, number, number]; score: number } | null = null
    for (let i = 0; i < idx.length; i++) {
      const m = idx.length
      const i0 = idx[(i - 1 + m) % m]
      const i1 = idx[i]
      const i2 = idx[(i + 1) % m]
      const a = pts[i0]
      const b = pts[i1]
      const c = pts[i2]
      if (cross3(a, b, c) <= 0) continue // вогнутая вершина — не «ухо»
      let free = true
      for (let q = 0; q < idx.length; q++) {
        const j = idx[q]
        if (j === i0 || j === i1 || j === i2) continue
        // мешают только вогнутые вершины: выпуклая внутрь уха попасть не может.
        // Проверять все подряд нельзя — после вшивания выреза мостом его вершины
        // лежат ровно на границе уха и блокировали бы любое ухо.
        const prev = pts[idx[(q - 1 + idx.length) % idx.length]]
        const next = pts[idx[(q + 1) % idx.length]]
        if (cross3(prev, pts[j], next) > 0) continue
        if (insideDepth(pts[j], a, b, c) > 0.001) { free = false; break }
      }
      if (!free) continue
      const score = minAngleOf(a, b, c)
      if (!best || score > best.score) best = { at: i, tri: [i0, i1, i2], score }
    }
    if (!best) break // самопересекающийся контур — разбить нельзя
    out.push(best.tri)
    idx.splice(best.at, 1)
  }
  if (idx.length > 2) return []
  return delaunayFlip(out, pts)
}

/** Лежит ли d внутри описанной окружности треугольника abc. */
function inCircle(a: XY, b: XY, c: XY, d: XY): boolean {
  // координаты в метрах: определитель четвёртого порядка на миллиметрах
  // выходит за точность double
  const s = 1000
  const ax = (a.x - d.x) / s; const ay = (a.y - d.y) / s
  const bx = (b.x - d.x) / s; const by = (b.y - d.y) / s
  const cx = (c.x - d.x) / s; const cy = (c.y - d.y) / s
  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx)
  return cross3(a, b, c) > 0 ? det > 1e-9 : det < -1e-9
}

/**
 * Полировка разбивки: пока находится «неделонеевское» ребро, перекидываем
 * диагональ в общем четырёхугольнике двух соседних треугольников. Это
 * максимизирует минимальный угол — треугольники становятся толще, диагонали
 * короче, засечки надёжнее. Контур и площадь при этом не меняются.
 */
export function delaunayFlip(tris: [number, number, number][], pts: XY[]): [number, number, number][] {
  const t = tris.map((x) => [...x] as [number, number, number])
  const key = (i: number, j: number) => (i < j ? `${i}|${j}` : `${j}|${i}`)

  for (let pass = 0; pass < 200; pass++) {
    const owners = new Map<string, number[]>()
    t.forEach((tri, ti) => {
      for (let k = 0; k < 3; k++) {
        const kk = key(tri[k], tri[(k + 1) % 3])
        const arr = owners.get(kk)
        if (arr) arr.push(ti)
        else owners.set(kk, [ti])
      }
    })

    let flipped = false
    for (const [kk, own] of owners) {
      if (own.length !== 2) continue // граничное ребро контура не трогаем
      const [t1, t2] = own
      const [i, j] = kk.split('|').map(Number)
      const c = t[t1].find((v) => v !== i && v !== j)
      const d = t[t2].find((v) => v !== i && v !== j)
      if (c === undefined || d === undefined || c === d) continue
      if (owners.has(key(c, d))) continue // такое ребро уже есть
      const A = pts[i]; const B = pts[j]; const C = pts[c]; const D = pts[d]
      // перекидывать можно только в выпуклом четырёхугольнике
      const s1 = cross3(C, D, A)
      const s2 = cross3(C, D, B)
      if (s1 === 0 || s2 === 0 || (s1 > 0) === (s2 > 0)) continue
      if (!inCircle(A, B, C, D)) continue
      t[t1] = [i, c, d]
      t[t2] = [c, j, d]
      flipped = true
      break // карту рёбер после переворота нужно пересобрать
    }
    if (!flipped) break
  }
  return t
}

/** Расстояние от точки до отрезка — нужно, чтобы мост не задевал чужие вершины. */
function distToSeg(p: XY, a: XY, b: XY): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

/**
 * Соединяет вырез с внешним контуром «мостом» — двойным разрезом от вершины
 * контура к вершине выреза. Многоугольник с дыркой превращается в обычный
 * простой контур, который уже можно резать на уши.
 *
 * Мост ищем самый короткий из тех, что не пересекают ни одной стороны и идут
 * внутри полотна. Так треугольники обязательно упираются в углы выреза,
 * а не проходят сквозь него.
 */
export function bridgeHoles<T extends XY>(outer: T[], holes: T[][]): T[] | null {
  let ring: T[] = outer.slice()
  if (signedArea2(ring) < 0) ring.reverse()

  for (const raw of holes) {
    if (raw.length < 3) continue
    const hole = raw.slice()
    if (signedArea2(hole) > 0) hole.reverse() // вырез обходим в обратную сторону

    const bridge = findBridge(ring, hole)
    if (!bridge) return null
    const { i, j } = bridge
    ring = [
      ...ring.slice(0, i + 1),
      ...hole.slice(j), ...hole.slice(0, j + 1),
      ...ring.slice(i),
    ]
  }
  return ring
}

function findBridge<T extends XY>(ring: T[], hole: T[]): { i: number; j: number } | null {
  let best: { i: number; j: number; d: number } | null = null
  for (let i = 0; i < ring.length; i++) {
    for (let j = 0; j < hole.length; j++) {
      const a = ring[i]
      const b = hole[j]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (best && d >= best.d) continue
      if (!bridgeIsClear(a, b, ring, hole)) continue
      best = { i, j, d }
    }
  }
  return best ? { i: best.i, j: best.j } : null
}

function bridgeIsClear<T extends XY>(a: XY, b: XY, ring: T[], hole: T[]): boolean {
  const eps = 1e-6
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  if (chord < eps) return false
  const touches = (p: XY) => (Math.hypot(p.x - a.x, p.y - a.y) < eps || Math.hypot(p.x - b.x, p.y - b.y) < eps)

  for (const poly of [ring, hole]) {
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k]
      const q = poly[(k + 1) % poly.length]
      if (properIntersect(a, b, p, q)) return false
      // мост не должен ложиться на чужую вершину — иначе получим вырожденное ухо
      if (!touches(p) && distToSeg(p, a, b) < chord * 1e-6) return false
    }
  }
  // середина моста обязана лежать внутри полотна и снаружи выреза
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (!insidePolygon(mid, ring)) return false
  if (insidePolygon(mid, hole)) return false
  return true
}

function insidePolygon(p: XY, pts: XY[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface TriIds { a: string; b: string; c: string }

/** Приводит треугольник к положительному обходу (нужно для сборки контура). */
export function orientTri<T extends TriIds>(t: T, get: (id: string) => XY | undefined): T {
  const A = get(t.a); const B = get(t.b); const C = get(t.c)
  if (A && B && C && cross3(A, B, C) < 0) return { ...t, b: t.c, c: t.b }
  return t
}

/**
 * Контур сетки треугольников: рёбра, принадлежащие ровно одному треугольнику,
 * сшитые в один замкнутый обход. null — сетка не односвязная (дырка/разрыв).
 * Треугольники должны быть предварительно ориентированы (orientTri).
 */
export function boundaryLoop(tris: TriIds[]): string[] | null {
  if (!tris.length) return null
  const directed: [string, string][] = []
  for (const t of tris) directed.push([t.a, t.b], [t.b, t.c], [t.c, t.a])
  const seen = new Set(directed.map(([u, v]) => `${u}>${v}`))
  const boundary = directed.filter(([u, v]) => !seen.has(`${v}>${u}`))
  if (boundary.length < 3) return null
  const next = new Map<string, string>()
  for (const [u, v] of boundary) {
    if (next.has(u)) return null // из вершины два свободных ребра — сетка «восьмёркой»
    next.set(u, v)
  }
  const start = boundary[0][0]
  const loop: string[] = [start]
  let cur = next.get(start)
  while (cur && cur !== start && loop.length <= boundary.length) {
    loop.push(cur)
    cur = next.get(cur)
  }
  if (cur !== start || loop.length !== boundary.length) return null // несколько контуров
  return loop
}

/** Ключ неориентированного ребра — тот же формат, что и в useGeometry. */
export function undirectedKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
