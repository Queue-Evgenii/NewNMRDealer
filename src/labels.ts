/**
 * Подписи углов и сторон. На замере диктуют буквами: «сторона АБ — 3200»,
 * «угол Б», поэтому и в приложении углы буквенные, а не номерные.
 *
 * Ё, Й, Ъ, Ы, Ь пропущены — на слух и в рукописи их путают.
 */
const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'

/** Буква угла по его номеру в контуре; имя из мастера замера сильнее буквы. */
export function cornerLabel(index: number, name?: string): string {
  const own = (name ?? '').trim()
  if (own) return own
  const n = LETTERS.length
  const letter = LETTERS[((index % n) + n) % n]
  return index >= n ? `${letter}${Math.floor(index / n) + 1}` : letter
}

/** Подпись стороны по её концам: «АБ». */
export function sideLabel(i: number, j: number, ni?: string, nj?: string): string {
  return `${cornerLabel(i, ni)}${cornerLabel(j, nj)}`
}
