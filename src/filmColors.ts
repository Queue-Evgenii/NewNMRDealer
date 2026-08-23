// A fixed display colour per film type — purely to tell at a glance which
// polотно is selected on the canvas / in 3D. Not a colour picker.

export const FILM_COLORS: Record<string, string> = {
  'Глянец': '#5aa0ff',   // blue
  'Мат': '#9aa7b4',      // grey
  'Сатин': '#d9a441',    // warm gold
  'Фактура': '#4fd08a',  // green
}

export function filmColor(film: string): string {
  return FILM_COLORS[film] ?? '#5aa0ff'
}
