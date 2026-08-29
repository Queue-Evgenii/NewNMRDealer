/**
 * Сервис-воркер: он и держит версию. Открытая вкладка работает на своей
 * сборке, новый воркер ждёт в стороне, пока не нажмут «Обновить».
 *
 * Здесь же — опрос `/version.json`: по нему видно номер новой версии и то,
 * обязательное ли обновление. Один только воркер этого сказать не может.
 */
import { registerSW } from 'virtual:pwa-register'
import { APP_VERSION } from 'virtual:app-version'
import { checkVersion, markReady, setApply, setCurrentVersion } from './version'

/** Как часто спрашивать сервер о версии: раз в 15 минут и при возврате во вкладку. */
const PERIOD = 15 * 60 * 1000

/** Дождаться, пока скачанный воркер встанет в очередь (или сдаться). */
function waitInstalled(worker: ServiceWorker): Promise<void> {
  return new Promise((done) => {
    const check = () => {
      if (worker.state === 'installed' || worker.state === 'redundant' || worker.state === 'activated') done()
    }
    worker.addEventListener('statechange', check)
    check()
    setTimeout(done, 5000)
  })
}

/**
 * Применить обновление.
 *
 * Одной перезагрузки мало: страницу отдаёт воркер, и она вернёт ту же сборку.
 * Поэтому сначала заставляем воркер проверить сервер, дожидаемся, пока новый
 * встанет в очередь, и просим его сменить старого — перезагрузка идёт уже
 * после смены (`controllerchange`).
 */
async function applyNow() {
  const reg = await navigator.serviceWorker?.getRegistration()
  if (!reg) { location.reload(); return }

  await reg.update().catch(() => { /* сети нет — попробуем тем, что есть */ })
  if (!reg.waiting && reg.installing) await waitInstalled(reg.installing)

  if (!reg.waiting) { location.reload(); return }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  // страховка: если смена не пришла, перезагружаемся всё равно
  setTimeout(() => location.reload(), 2000)
}

export function initUpdates() {
  setCurrentVersion(APP_VERSION)

  registerSW({
    immediate: true,
    onNeedRefresh: markReady,
    onRegisteredSW(_url, reg) {
      if (!reg) return
      setInterval(() => reg.update(), PERIOD)
    },
  })
  setApply(applyNow)

  checkVersion()
  setInterval(() => checkVersion(), PERIOD)
  // установленное приложение неделями не перезагружают — спрашиваем при
  // каждом возврате к нему; на телефоне focus приходит не всегда, поэтому
  // слушаем ещё и смену видимости
  window.addEventListener('focus', () => checkVersion())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkVersion()
  })
}
