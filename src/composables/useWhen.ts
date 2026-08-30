/**
 * Человеческие даты для карточек проектов и строки «сохранено».
 * Сегодня — время, вчера — словом, дальше — числом.
 */
import { currentLocale, t } from '../i18n'

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

const time = (d: Date) => d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
const day = (d: Date) => d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' })

/** Коротко — для списка проектов: «14:32», «вчера», «12 авг». */
export function shortWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (sameDay(d, now)) return time(d)
  if (sameDay(d, new Date(now.getTime() - 86400000))) return t('saved.yesterdayWord')
  return day(d)
}

/** Подробно — для шапки: «сохранено 14:32», «сохранено вчера 14:32». */
export function savedWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (sameDay(d, now)) return t('saved.today', { time: time(d) })
  if (sameDay(d, new Date(now.getTime() - 86400000))) return t('saved.yesterday', { time: time(d) })
  return t('saved.other', { day: day(d), time: time(d) })
}
