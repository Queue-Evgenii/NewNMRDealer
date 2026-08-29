import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string
  minSupported?: string
}
/** Что приложение спросит у сервера: какая версия свежая и ниже какой нельзя. */
const info = JSON.stringify({
  version: pkg.version,
  minSupported: pkg.minSupported ?? pkg.version,
})

const VIRTUAL = 'virtual:app-version'
const RESOLVED = '\0' + VIRTUAL

/**
 * Две вещи о версии:
 *  • `virtual:app-version` — какая сборка сейчас выполняется. Через `define`
 *    это не делается: в Vite 8 подстановка до кода не доходит, версия так и
 *    остаётся именем переменной.
 *  • `/version.json` — что лежит на сервере. В кэш воркера он не попадает
 *    (там только js/css/html/svg), поэтому сборка не спрашивает о новой
 *    версии саму себя.
 */
function appVersion(): Plugin {
  return {
    name: 'nmr-app-version',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null
    },
    load(id) {
      return id === RESOLVED ? `export const APP_VERSION = ${JSON.stringify(pkg.version)}` : null
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(info)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: info })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    appVersion(),
    VitePWA({
      // 'prompt': новый воркер ждёт в стороне, пока не нажмут «Обновить»
      registerType: 'prompt',
      injectRegister: null, // регистрируем сами — см. src/pwa.ts
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'NMR Dealer — конструктор потолков',
        short_name: 'NMR Dealer',
        description: 'Чертёж натяжного потолка: площадь, раскрой и цена',
        lang: 'ru',
        display: 'standalone',
        start_url: '/',
        background_color: '#0f1420',
        theme_color: '#0f1420',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
