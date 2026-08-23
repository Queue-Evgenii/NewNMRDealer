// Domain model for the ceiling (полотно) configurator.
// All coordinates are in millimetres (mm) — real-world dimensions,
// matching the original NMRDealer construction data (coord_point / linedata).

export interface Point {
  id: string
  x: number // mm
  y: number // mm
}

/** Per-edge properties, mirroring the original garpun / seam (spayka) flags. */
export interface EdgeProps {
  garpun: boolean // гарпун по стороне
  seam: boolean   // шов / спайка
}

export interface Edge {
  key: string   // stable id = sorted pair of point ids
  a: Point
  b: Point
  length: number // mm
  props: EdgeProps
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
  snap: boolean       // snap new/moved points to grid
  usad: number        // усадка, % (film shrinkage)
  pxPerMm: number     // canvas scale
}

/** Order metadata + rates for the cost calculation (валюта PLN as in original). */
export interface Order {
  client: string
  film: string   // тип полотна / фактура
  color: string
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
  points: Point[]
  edgeProps: Record<string, EdgeProps>
  closed: boolean
  settings: Settings
  order?: Order
  pricing?: Pricing
}
