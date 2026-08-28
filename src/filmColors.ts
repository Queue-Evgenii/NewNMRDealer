// Типы полотна и их метки. Цвет здесь — только метка типа в списке выбора,
// он не имеет отношения к цвету потолка (тот живёт на полотне, colorHex).

export const FILM_COLORS: Record<string, string> = {
  'Глянец': '#5aa0ff',   // blue
  'Мат': '#9aa7b4',      // grey
  'Сатин': '#d9a441',    // warm gold
  'Фактура': '#4fd08a',  // green
}

/** Порядок фиксирован: по номеру плёнка едет в ссылке на чертёж. */
export const FILMS = Object.keys(FILM_COLORS)

export const DEFAULT_FILM = FILMS[0]

export function filmColor(film: string): string {
  return FILM_COLORS[film] ?? '#5aa0ff'
}
