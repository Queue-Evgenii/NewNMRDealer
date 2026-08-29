/**
 * Версия приложения и обновления по кнопке.
 *
 * Правило простое: то, что открыто, само не меняется. Новая сборка скачивается
 * фоном, но подхватывается только когда человек нажал «Обновить» — иначе на
 * середине замера чертёж перезагрузился бы под руками. Исключение — версия
 * ниже минимальной: работать на ней нельзя, и приложение просит обновиться.
 */
import { reactive } from 'vue'


/** Что лежит на сервере: `/version.json` рядом со сборкой. */
export interface VersionInfo {
  version: string
  /** Ниже этой версии пользоваться нельзя — обновление обязательное. */
  minSupported: string
}

/**
 * В разработке приложение всегда на последнем коде: сервис-воркера нет,
 * Vite отдаёт исходники и подменяет модули на лету. Держать версию можно
 * только в собранной копии, поэтому дев помечаем явно.
 */
export const IS_DEV = import.meta.env.DEV

const VERSION_URL = import.meta.env.VITE_VERSION_URL ?? '/version.json'

/** Сравнение вида 1.2.3: −1, 0, 1. Нечисловые хвосты игнорируем. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

export const version = reactive({
  current: '0.0.0',
  latest: '0.0.0',
  minSupported: '0.0.0',
  /** На сервере лежит версия новее нашей. */
  available: false,
  /** Новый код уже скачан воркером и ждёт перезапуска. */
  ready: false,
  /** Наша версия ниже минимальной — работать нельзя. */
  blocked: false,
})

/**
 * Версию этой сборки знает только сборщик, поэтому её сообщает точка входа
 * (см. src/pwa.ts и virtual:app-version). В тестах ставится руками.
 */
export function setCurrentVersion(v: string) {
  version.current = v
  version.latest = v
  version.minSupported = v
}

export function applyInfo(info: VersionInfo) {
  const latest = info.version || version.current
  const min = info.minSupported || latest
  version.latest = latest
  version.minSupported = min
  version.available = compareVersions(latest, version.current) > 0
  version.blocked = compareVersions(version.current, min) < 0
}

/** Воркер скачал новую сборку — она ждёт нажатия. */
export function markReady() {
  version.ready = true
}

export async function checkVersion(fetcher: typeof fetch = fetch): Promise<void> {
  try {
    // строго мимо кэша: иначе спросим у той же сборки, что и работает
    const res = await fetcher(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    applyInfo(await res.json() as VersionInfo)
  } catch { /* сети нет — работаем на своей версии */ }
}

// как именно применить обновление, знает pwa.ts: там живёт сервис-воркер
let apply: (() => Promise<void> | void) | null = null
export function setApply(fn: () => Promise<void> | void) { apply = fn }

export async function applyUpdate() {
  if (apply) return apply()
  location.reload()
}
