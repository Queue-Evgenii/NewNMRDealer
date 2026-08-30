import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { initTheme } from './theme'
import { initUpdates } from './pwa'
import { i18n, initLocale } from './i18n'

initTheme()
initLocale()
initUpdates()

const app = createApp(App).use(createPinia()).use(i18n).use(router)

// Mount only after the router has resolved the initial route, so the app shell
// (left nav) never flashes on the bare configurator route.
router.isReady().then(() => app.mount('#app'))
