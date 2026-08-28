/**
 * Прайс МВП: цифры зашиты в приложении. Справочника цен пока нет — когда
 * появится, меняется только этот файл.
 */
import { DEFAULT_FILM } from './filmColors'

export const CURRENCY = 'PLN'

/** Полотно за м² — по типу плёнки. */
export const FILM_PER_M2: Record<string, number> = {
  'Глянец': 45,
  'Мат': 38,
  'Сатин': 52,
  'Фактура': 68,
}

export const GARPUN_PER_M = 6  // гарпун, пог. м
export const SEAM_PER_M = 12   // спайка (шов), пог. м
export const WORK_PER_M2 = 20  // монтаж, м²

export interface Metrics {
  areaM2: number
  garpunM: number
  seamM: number
  film: string
}

export function priceOf({ areaM2, garpunM, seamM, film }: Metrics): number {
  const perM2 = FILM_PER_M2[film] ?? FILM_PER_M2[DEFAULT_FILM]
  return areaM2 * perM2 + garpunM * GARPUN_PER_M + seamM * SEAM_PER_M + areaM2 * WORK_PER_M2
}
