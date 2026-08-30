// Типы полотна и их метки. Цвет здесь — только метка типа в списке выбора,
// он не имеет отношения к цвету потолка (тот живёт на полотне, colorHex).
//
// Идентификатор плёнки стабилен и не переводится: он лежит в сохранённых
// чертежах, служит ключом в прайсе и едет номером в ссылке. Переводится
// только подпись — через `filmLabel`.
import { t } from './i18n'

/** Порядок фиксирован: по номеру плёнка едет в ссылке на чертёж. */
export const FILMS = ['gloss', 'mat', 'satin', 'texture']

export const FILM_COLORS: Record<string, string> = {
  gloss: '#5aa0ff',   // blue
  mat: '#9aa7b4',     // grey
  satin: '#d9a441',   // warm gold
  texture: '#4fd08a', // green
}

export const DEFAULT_FILM = FILMS[0]

export function filmColor(film: string): string {
  return FILM_COLORS[film] ?? '#5aa0ff'
}

export function filmLabel(film: string): string {
  return t(`film.${film}`)
}

/**
 * Чертежи до v3 хранили плёнку русским названием. Читаем их по этой таблице —
 * писать в неё больше некому.
 */
export const LEGACY_FILMS: Record<string, string> = {
  'Глянец': 'gloss',
  'Мат': 'mat',
  'Сатин': 'satin',
  'Фактура': 'texture',
}
