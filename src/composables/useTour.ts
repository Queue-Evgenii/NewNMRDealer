/**
 * Пошаговое обучение: подсветить настоящий элемент интерфейса и сказать о нём
 * одну фразу. Никаких длинных текстов — человек смотрит на кнопку, а не читает.
 *
 * Шаг привязан к атрибуту `data-tour` на элементе. Чего нет на экране (панель
 * инструментов на телефоне, шестерёнка в закрытом списке) — тот шаг пропускаем.
 */
import { t } from '../i18n'

export interface TourStep {
  /** Значение data-tour у подсвечиваемого элемента. */
  target: string
  title: string
  text: string
}

/** Шаги обучения. Собираются при показе: подписи зависят от текущего языка. */
export function tourSteps(): TourStep[] {
  return [
    { target: 'new', title: t('tour.newTitle'), text: t('tour.newText') },
    { target: 'modes', title: t('tour.modesTitle'), text: t('tour.modesText') },
    { target: 'canvas', title: t('tour.canvasTitle'), text: t('tour.canvasText') },
    { target: 'panel', title: t('tour.panelTitle'), text: t('tour.panelText') },
    { target: 'tabs', title: t('tour.tabsTitle'), text: t('tour.tabsText') },
    { target: 'projects', title: t('tour.projectsTitle'), text: t('tour.projectsText') },
    { target: 'settings', title: t('tour.settingsTitle'), text: t('tour.settingsText') },
  ]
}

export const selectorOf = (step: TourStep) => `[data-tour="${step.target}"]`

/** Шаги, для которых элемент сейчас есть на экране. */
export function visibleSteps(steps: TourStep[] = tourSteps()): TourStep[] {
  return steps.filter((s) => !!document.querySelector(selectorOf(s)))
}

const KEY = 'nmr.tour.seen'

/** Обучение показывают один раз — при первом запуске. */
export function tourSeen(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return true }
}
export function markTourSeen() {
  try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
}

// ---- где показать подпись ------------------------------------------------

export interface Box { top: number; left: number; width: number; height: number }

/**
 * Кладём карточку рядом с подсветкой так, чтобы она её не накрывала: снизу,
 * сверху, справа, слева — что первым влезет в экран. Если цель во весь экран
 * (холст, панель), прижимаем к той стороне, где свободного места больше.
 */
export function placeCard(spot: Box, card: { width: number; height: number },
  vw: number, vh: number, gap = 12): { top: number; left: number } {
  const m = 8 // отступ от края экрана
  const cw = card.width || 320
  const ch = card.height || 180
  const clampX = (l: number) => Math.min(Math.max(m, l), Math.max(m, vw - cw - m))
  const clampY = (t: number) => Math.min(Math.max(m, t), Math.max(m, vh - ch - m))
  const overlaps = (t: number, l: number) =>
    l < spot.left + spot.width && l + cw > spot.left && t < spot.top + spot.height && t + ch > spot.top
  const fits = (t: number, l: number) =>
    t >= m && l >= m && t + ch <= vh - m && l + cw <= vw - m && !overlaps(t, l)

  const tries = [
    { top: spot.top + spot.height + gap, left: clampX(spot.left) },
    { top: spot.top - ch - gap, left: clampX(spot.left) },
    { top: clampY(spot.top), left: spot.left + spot.width + gap },
    { top: clampY(spot.top), left: spot.left - cw - gap },
  ]
  for (const t of tries) if (fits(t.top, t.left)) return t

  // цель занимает почти весь экран — уходим туда, где её меньше
  const below = vh - (spot.top + spot.height)
  return { top: below >= spot.top ? vh - ch - m : m, left: clampX(vw - cw - m) }
}
