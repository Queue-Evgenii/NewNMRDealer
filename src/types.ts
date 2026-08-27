// Domain model for the ceiling (полотно) configurator.
// All coordinates are in millimetres (mm) — real-world dimensions,
// matching the original NMRDealer construction data (coord_point / linedata).

export interface Point {
  id: string
  x: number // mm
  y: number // mm
  /** Имя угла из мастера построения: «А», «у окна». Пусто — номер по порядку. */
  name?: string
}

/** Per-edge properties, mirroring the original garpun / seam (spayka) flags. */
export interface EdgeProps {
  garpun: boolean // гарпун по стороне
  seam: boolean   // шов / спайка
  /** Скругление стороны: bulge = tan(θ/4); 0 — прямая. Стрелка = хорда*bulge/2. */
  bulge: number
}

export interface Edge {
  key: string   // stable id = sorted pair of point ids
  shapeId: string
  a: Point
  b: Point
  /** Длина стороны по факту: у скруглённой — длина дуги, мм. */
  length: number
  /** Прямое расстояние между концами (хорда), мм. */
  chord: number
  props: EdgeProps
}

/**
 * Один треугольник замера — ссылки на вершины контура.
 * Треугольники одной фигуры не пересекаются и вместе покрывают её целиком.
 */
export interface Triangle {
  id: string
  a: string // point id
  b: string
  c: string
}

/**
 * Роль контура: полотно яруса или вырез в нём (колонна, короб, проём под
 * нижний ярус). Вырез вычитается из площади того яруса, внутри которого лежит.
 */
export type ShapeKind = 'ceiling' | 'hole'

/** One independent closed/open contour on the canvas (a separate ceiling piece). */
export interface Shape {
  id: string
  points: Point[]
  closed: boolean
  edgeProps: Record<string, EdgeProps>
  /** Разбиение фигуры на треугольники (метод треугольников). Пусто — не размечена. */
  triangles: Triangle[]
  /**
   * Вершины замера, оказавшиеся внутри контура — например точка, из которой
   * мерили до всех углов. В периметр и обход контура не входят.
   */
  innerPoints: Point[]
  /** Геометрию правили руками после замера — длины больше не те, что диктовали. */
  measureDirty: boolean
  /** Полотно или вырез в нём. */
  kind: ShapeKind
  /** Номер яруса: 1 — основной потолок, дальше вниз. */
  level: number
  /** Перепад яруса вниз от основного уровня, мм (для 3D и спецификации). */
  drop: number
}

export interface Diagonal {
  fromId: string
  toId: string
  length: number // mm
}

export interface Settings {
  gridStep: number    // mm between grid lines
  showGrid: boolean
  showMeasures: boolean
  showTriangles: boolean // показывать разбивку на треугольники
  snap: boolean       // единая привязка: вершины, оси, углы, шаг сетки
  usad: number        // усадка, % (film shrinkage)
  pxPerMm: number     // canvas scale
}

/** Order metadata + rates for the cost calculation (валюта PLN as in original). */
export interface Order {
  client: string
  film: string   // тип полотна / фактура (Глянец / Мат / Сатин / Фактура)
  color: string  // название цвета
  currency: string
}

export interface Pricing {
  filmPerM2: number   // цена полотна за м²
  garpunPerM: number  // гарпун за пог. м
  seamPerM: number    // спайка/шов за пог. м
  workPerM2: number   // монтаж за м²
}

export interface CostBreakdown {
  film: number
  garpun: number
  seam: number
  work: number
  total: number
}

export interface SerializedModel {
  version: number
  shapes: Shape[]
  activeShapeId: string
  settings: Settings
  order?: Order
  pricing?: Pricing
  tool?: string
  hiddenLevels?: number[]
  selectedPointId?: string | null
  selectedEdgeKey?: string | null
}
