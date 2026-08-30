/**
 * Языки приложения. По умолчанию русский; выбор человека переживает перезапуск.
 *
 * Доменные значения (плёнка, цвет, буквы углов) в словарь не входят как ключи —
 * они хранятся идентификаторами, а перевод берётся по ним. Иначе смена языка
 * рушила бы сохранённые чертежи и цены.
 */
import { createI18n } from 'vue-i18n'
import ru from './locales/ru'
import pl from './locales/pl'
import en from './locales/en'

export const LOCALES = ['ru', 'pl', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Подпись языка — всегда на нём самом, чтобы её узнали не читая остального. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ru: 'Русский',
  pl: 'Polski',
  en: 'English',
}

const KEY = 'nmr.locale'

function stored(): Locale {
  try {
    const v = localStorage.getItem(KEY)
    if (LOCALES.includes(v as Locale)) return v as Locale
  } catch { /* приватный режим — просто русский */ }
  return 'ru'
}

/**
 * Славянское множественное: 1 точка · 2 точки · 5 точек, и то же в польском
 * (1 znak · 2 znaki · 5 znaków). Встроенное правило vue-i18n знает только пару
 * «один/много» и на 2 и 5 давало бы одну форму.
 */
function slavicPlural(choice: number): number {
  const n = Math.abs(choice) % 100
  const last = n % 10
  if (n > 10 && n < 20) return 2
  if (last === 1) return 0
  if (last > 1 && last < 5) return 1
  return 2
}

export const i18n = createI18n({
  legacy: false,
  locale: stored(),
  fallbackLocale: 'ru',
  messages: { ru, pl, en },
  pluralRules: { ru: slavicPlural, pl: slavicPlural },
})

export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  try { localStorage.setItem(KEY, locale) } catch { /* ignore */ }
  document.documentElement.lang = locale
}

/** Перевод вне компонента — в сторе, композабле, экспорте CSV. */
export const t = i18n.global.t

/** Вызывается один раз при старте приложения. */
export function initLocale() {
  document.documentElement.lang = currentLocale()
}
