/**
 * Чертёж в ссылке — без бекенда и без файлов.
 *
 * Обычный JSON модели для URL непригоден: там больше половины веса занимают
 * идентификаторы точек и ключи сторон вида `pmf3k2|pmf3k5`. Для передачи они
 * не нужны — точки нумеруются по порядку, стороны адресуются номером.
 *
 * Формат: компактная структура → JSON → deflate → base64url. Полезная нагрузка
 * живёт в hash-части адреса, поэтому на сервер не уходит вообще и не попадает
 * ни в логи, ни в историю запросов.
 */
import type { EdgeProps, Point, SerializedModel, Shape } from '../types'
import { edgeKey, newId } from './useGeometry'
import { DEFAULT_COLOR, normalizeHex } from '../ceilingColors'
import { DEFAULT_FILM, FILMS } from '../filmColors'

/** Одна фигура в компактном виде. */
interface PackedShape {
  /** индекс первой точки в общей таблице */
  i: number
  /** сколько точек контура */
  n: number
  /** сколько внутренних точек замера */
  m: number
  c: 0 | 1
  /** 1 — вырез */
  k: 0 | 1
  l: number
  d: number
  /** отличия сторон от умолчания: [номер стороны, гарпун, шов, кривизна×1000] */
  e: [number, 0 | 1, 0 | 1, number][]
  /** треугольники замера по индексам общей таблицы точек */
  t: [number, number, number][]
  /** цвет полотна, шесть знаков без решётки */
  cf: string
  /** плёнка — номер в FILMS */
  fi: number
}

interface Packed {
  v: 1
  /** все точки подряд, дельта-кодированные: x0,y0,dx,dy,… */
  p: number[]
  s: PackedShape[]
  /** усадка, шаг сетки */
  st: [number, number]
  /** клиент, валюта */
  o: [string, string]
  /** спрятанные ярусы */
  h: number[]
}

const DEFAULT_EDGE: EdgeProps = { garpun: true, seam: false, bulge: 0 }

function packModel(model: SerializedModel): Packed {
  const coords: number[] = []
  const index = new Map<string, number>()
  let prevX = 0
  let prevY = 0
  const pushPoint = (p: Point) => {
    index.set(p.id, index.size)
    coords.push(Math.round(p.x) - prevX, Math.round(p.y) - prevY)
    prevX = Math.round(p.x)
    prevY = Math.round(p.y)
  }

  const shapes: PackedShape[] = []
  for (const s of model.shapes) {
    const first = index.size
    for (const p of s.points) pushPoint(p)
    for (const p of s.innerPoints ?? []) pushPoint(p)
    shapes.push({
      i: first,
      n: s.points.length,
      m: (s.innerPoints ?? []).length,
      c: s.closed ? 1 : 0,
      k: s.kind === 'hole' ? 1 : 0,
      l: s.level ?? 1,
      d: s.drop ?? 0,
      e: [],
      t: [],
      cf: (s.colorHex ?? DEFAULT_COLOR.hex).replace('#', ''),
      fi: Math.max(0, FILMS.indexOf(s.film)),
    })
  }

  // стороны и треугольники — вторым проходом, когда вся таблица точек готова
  model.shapes.forEach((s, si) => {
    const packed = shapes[si]
    const n = s.points.length
    const last = s.closed ? n : n - 1
    for (let e = 0; e < last; e++) {
      const key = edgeKey(s.points[e].id, s.points[(e + 1) % n].id)
      const props = { ...DEFAULT_EDGE, ...s.edgeProps?.[key] }
      if (props.garpun === DEFAULT_EDGE.garpun && props.seam === DEFAULT_EDGE.seam && !props.bulge) continue
      packed.e.push([e, props.garpun ? 1 : 0, props.seam ? 1 : 0, Math.round(props.bulge * 1000)])
    }
    for (const t of s.triangles ?? []) {
      const a = index.get(t.a)
      const b = index.get(t.b)
      const c = index.get(t.c)
      if (a === undefined || b === undefined || c === undefined) continue
      packed.t.push([a, b, c])
    }
  })

  return {
    v: 1,
    p: coords,
    s: shapes,
    st: [model.settings?.usad ?? 7, model.settings?.gridStep ?? 100],
    o: [model.order?.client ?? '', model.order?.currency ?? 'PLN'],
    h: model.hiddenLevels ?? [],
  }
}

function unpackModel(packed: Packed): SerializedModel {
  // восстанавливаем координаты и раздаём точкам свежие идентификаторы
  const pts: Point[] = []
  let x = 0
  let y = 0
  for (let i = 0; i < packed.p.length; i += 2) {
    x += packed.p[i]
    y += packed.p[i + 1]
    pts.push({ id: newId(), x, y })
  }

  const shapes: Shape[] = packed.s.map((ps) => {
    const points = pts.slice(ps.i, ps.i + ps.n)
    const innerPoints = pts.slice(ps.i + ps.n, ps.i + ps.n + ps.m)
    const edgeProps: Record<string, EdgeProps> = {}
    const n = points.length
    for (const [e, garpun, seam, bulge] of ps.e) {
      if (e >= n) continue
      const key = edgeKey(points[e].id, points[(e + 1) % n].id)
      edgeProps[key] = { garpun: !!garpun, seam: !!seam, bulge: bulge / 1000 }
    }
    return {
      id: newId(),
      points,
      closed: !!ps.c,
      edgeProps,
      innerPoints,
      measureDirty: false,
      kind: ps.k ? 'hole' : 'ceiling',
      level: ps.l,
      drop: ps.d,
      colorHex: normalizeHex(ps.cf) ?? DEFAULT_COLOR.hex,
      film: FILMS[ps.fi] ?? DEFAULT_FILM,
      triangles: ps.t
        .filter(([a, b, c]) => pts[a] && pts[b] && pts[c])
        .map(([a, b, c]) => ({ id: newId(), a: pts[a].id, b: pts[b].id, c: pts[c].id })),
    }
  })

  return {
    version: 2,
    shapes,
    activeShapeId: shapes[0]?.id ?? '',
    settings: {
      usad: packed.st[0], gridStep: packed.st[1],
      showGrid: true, showMeasures: true, showTriangles: true, snap: true, pxPerMm: 0.18,
    },
    order: { client: packed.o[0], currency: packed.o[1] },
    hiddenLevels: packed.h,
  }
}

// ---- base64url + сжатие ---------------------------------------------------
function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Прогоняет байты через поток сжатия без Blob и Response — они есть не везде. */
async function pump(bytes: Uint8Array, tr: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close() },
  })
  const reader = src.pipeThrough(tr as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  return pump(bytes, new CompressionStream('deflate-raw'))
}
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  return pump(bytes, new DecompressionStream('deflate-raw'))
}

/** Модель → строка для адреса. Префикс: z — сжато, r — как есть. */
export async function encodeModel(model: SerializedModel): Promise<string> {
  const json = JSON.stringify(packModel(model))
  const raw = new TextEncoder().encode(json)
  const packedBytes = await deflate(raw)
  return packedBytes ? 'z' + toBase64Url(packedBytes) : 'r' + toBase64Url(raw)
}

/** Строка из адреса → модель; null, если ссылка битая. */
export async function decodeModel(payload: string): Promise<SerializedModel | null> {
  try {
    const body = fromBase64Url(payload.slice(1))
    const raw = payload[0] === 'z' ? await inflate(body) : body
    if (!raw) return null
    const packed = JSON.parse(new TextDecoder().decode(raw)) as Packed
    if (packed.v !== 1 || !Array.isArray(packed.s)) return null
    return unpackModel(packed)
  } catch {
    return null
  }
}

/** Готовая ссылка на текущий чертёж. Данные в hash — на сервер не уходят. */
export async function buildShareLink(model: SerializedModel): Promise<string> {
  const payload = await encodeModel(model)
  const base = location.href.split('#')[0]
  return `${base}#/?d=${payload}`
}
