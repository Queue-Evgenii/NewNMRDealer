/**
 * Мастер построения контура по стенам.
 *
 * Замерщик знает не координаты, а обход комнаты: длина стены — поворот —
 * следующая стена. Здесь этот обход превращается в углы.
 *
 * Последняя стена не вводится: она замыкает контур и вычисляется сама.
 * Так контур никогда «не сходится на 300 мм» — типичная беда таблиц,
 * где просят ввести все стены подряд.
 */

/** Поворот на конце стены, градусы: +90 — направо, −90 — налево, 0 — прямо. */
export interface WallSpec {
  /** Имя угла, из которого выходит стена. Пусто — подставим букву. */
  name: string
  /** Длина стены, мм. У замыкающей не используется. */
  length: number
  turn: number
}

export interface WizardPoint {
  x: number
  y: number
  name: string
}

/** Буквенные имена углов по умолчанию: А, Б, В… потом А1, Б1… */
const LETTERS = 'АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЭЮЯ'
export function cornerName(i: number): string {
  const round = Math.floor(i / LETTERS.length)
  return LETTERS[i % LETTERS.length] + (round ? String(round) : '')
}

/**
 * Обход стен → углы контура. Идём из (0,0) вправо; каждая стена ведёт в
 * следующий угол, поворот применяется на его конце.
 */
export function wallsToPoints(walls: WallSpec[]): WizardPoint[] {
  const n = walls.length
  if (n < 3) return []
  const pts: WizardPoint[] = []
  let x = 0
  let y = 0
  let dir = 0 // градусы, 0 — вправо
  for (let i = 0; i < n; i++) {
    pts.push({ x, y, name: walls[i].name.trim() || cornerName(i) })
    if (i === n - 1) break // последняя стена замыкает контур сама
    const rad = (dir * Math.PI) / 180
    x += Math.cos(rad) * walls[i].length
    y += Math.sin(rad) * walls[i].length
    dir += walls[i].turn
  }
  return pts.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }))
}

/** Длина замыкающей стены — её показываем в таблице как расчётную. */
export function closingLength(pts: WizardPoint[]): number {
  if (pts.length < 3) return 0
  const a = pts[pts.length - 1]
  const b = pts[0]
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y))
}

/** Площадь получившегося контура, м² — сразу видно, то ли построили. */
export function wizardAreaM2(pts: WizardPoint[]): number {
  if (pts.length < 3) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    sum += p.x * q.y - q.x * p.y
  }
  return Math.abs(sum) / 2 / 1_000_000
}

/** Расстояние от точки до отрезка, мм. */
function distToSeg(p: WizardPoint, a: WizardPoint, b: WizardPoint): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

/**
 * Что не так с обходом. Кроме честного пересечения крест-накрест ловим случаи,
 * когда стены налегают друг на друга или два угла попали в одну точку: обход
 * тогда складывается сам на себя, а внешне это заметно только по пропавшей
 * букве угла.
 */
export function contourProblem(pts: WizardPoint[]): string | null {
  const n = pts.length
  if (n < 3) return 'Углов должно быть хотя бы три'
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 1) {
        return `Углы ${pts[i].name} и ${pts[j].name} попали в одну точку — обход замкнулся раньше времени`
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    for (let k = 0; k < n; k++) {
      if (k === i || k === (i + 1) % n) continue
      if (distToSeg(pts[k], a, b) < 1) {
        return `Угол ${pts[k].name} лежит на стене ${a.name}–${b.name} — стены налегают друг на друга`
      }
    }
  }
  if (selfIntersects(pts)) return 'Стены пересекаются — поправьте повороты'
  return null
}

/** Контур сам себя пересекает — значит обход задан неверно. */
export function selfIntersects(pts: WizardPoint[]): boolean {
  const n = pts.length
  if (n < 4) return false
  const cross = (o: WizardPoint, a: WizardPoint, b: WizardPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const hits = (p1: WizardPoint, p2: WizardPoint, p3: WizardPoint, p4: WizardPoint) => {
    const d1 = cross(p3, p4, p1)
    const d2 = cross(p3, p4, p2)
    const d3 = cross(p1, p2, p3)
    const d4 = cross(p1, p2, p4)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue
      if (hits(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
  }
  return false
}

/**
 * Заготовка стен для комнаты с n углами.
 *
 * Прежняя версия просто повторяла 3000/2000 с поворотом направо — это
 * прямоугольник, и при пяти и более углах обход замыкался раньше времени,
 * складывая контур. Теперь строим ступенчатую комнату: прямоугольник, от
 * которого сверху отрезаны ступеньки, — она замкнута при любом числе углов.
 */
export function defaultWalls(n: number): WallSpec[] {
  const walls: WallSpec[] = []
  const push = (length: number, turn: number) => walls.push({ name: '', length, turn })

  if (n <= 4) {
    push(3000, 90)
    push(2000, 90)
    push(3000, 90)
    push(2000, 90)
    return walls.slice(0, Math.max(3, n))
  }

  const steps = Math.floor((n - 4) / 2) // сколько ступенек помещается
  push(3000, 90) // вправо по верхней стене
  push(2000, 90) // вниз по правой
  let run = 3000
  for (let i = 0; i < steps; i++) {
    const back = Math.max(500, Math.round(run / (steps + 1)))
    push(back, -90) // влево до ступеньки
    push(800, 90)   // вниз на ступеньку
    run -= back
  }
  push(Math.max(500, run), 90) // влево до левой стены
  // нечётное число углов добираем прямым углом на 180° — точка на стене
  while (walls.length < n) push(1000, 0)
  return walls.slice(0, n)
}
