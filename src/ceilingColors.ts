/**
 * Цвет полотна. Он живёт на самом полотне (`Shape.colorHex`) и больше нигде:
 * у каждого яруса свой цвет, отдельной «настройки по умолчанию» нет.
 *
 * В чертеже хранится только hex — название ходового цвета показывается по
 * идентификатору и переводится, а свой оттенок так и остаётся числом.
 */
import { t } from './i18n'

export interface CeilingColor {
  id: string
  hex: string
}

/** Ходовые цвета: с них начинается почти каждый заказ. */
export const BASIC_COLORS: CeilingColor[] = [
  { id: 'white', hex: '#f2f4f7' },
  { id: 'milk', hex: '#f3ecdd' },
  { id: 'ivory', hex: '#efe4c8' },
  { id: 'beige', hex: '#e3cfae' },
  { id: 'sand', hex: '#d9bd8a' },
  { id: 'lightGrey', hex: '#c3c9d1' },
  { id: 'grey', hex: '#8f98a3' },
  { id: 'graphite', hex: '#4a505a' },
  { id: 'black', hex: '#17191d' },
  { id: 'skyBlue', hex: '#8fc4e8' },
  { id: 'blue', hex: '#2c5aa8' },
  { id: 'turquoise', hex: '#2fa5a8' },
  { id: 'green', hex: '#3f8f5c' },
  { id: 'lime', hex: '#9ec94a' },
  { id: 'yellow', hex: '#edc63a' },
  { id: 'orange', hex: '#e2762a' },
  { id: 'red', hex: '#c8322f' },
  { id: 'burgundy', hex: '#7b1f2b' },
  { id: 'lilac', hex: '#9b7fc4' },
  { id: 'pink', hex: '#e39ab5' },
]

export const DEFAULT_COLOR: CeilingColor = BASIC_COLORS[0]

export function colorLabel(id: string): string {
  return t(`color.names.${id}`)
}

export function rgbOf(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(s, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** `#abc`, `abcdef`, `#ABCDEF` → `#abcdef`; мусор → null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(v)) return null
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  return `#${full.toLowerCase()}`
}

/** Светлый ли цвет — по нему решаем, чем писать поверх: тёмным или белым. */
export function isLight(hex: string): boolean {
  const { r, g, b } = rgbOf(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = rgbOf(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---- HSV: на нём стоит свой пикер ---------------------------------------

export interface Hsv { h: number; s: number; v: number }

export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = rgbOf(hex)
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0))
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const t = Math.floor(((h % 360) + 360) % 360 / 60)
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][t]
  const p = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}
