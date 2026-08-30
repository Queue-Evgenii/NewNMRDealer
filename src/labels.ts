/**
 * Подписи углов и сторон. На замере диктуют буквами: «сторона AB — 3200»,
 * «угол B», поэтому и в приложении углы буквенные, а не номерные.
 *
 * Буквы латинские во всех языках: один и тот же чертёж читают замерщик, цех и
 * заказчик, и подписи на нём не должны меняться вместе с языком интерфейса.
 * I, O, Q пропущены — их путают с единицей и нулём в рукописи.
 */
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'

/** Буква угла по его номеру в контуре; имя из мастера замера сильнее буквы. */
export function cornerLabel(index: number, name?: string): string {
  const own = (name ?? '').trim()
  if (own) return own
  const n = LETTERS.length
  const letter = LETTERS[((index % n) + n) % n]
  return index >= n ? `${letter}${Math.floor(index / n) + 1}` : letter
}

/** Подпись стороны по её концам: «AB». */
export function sideLabel(i: number, j: number, ni?: string, nj?: string): string {
  return `${cornerLabel(i, ni)}${cornerLabel(j, nj)}`
}
