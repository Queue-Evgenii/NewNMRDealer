import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { initTheme } from './theme'

initTheme()

const app = createApp(App).use(createPinia()).use(router)

// Mount only after the router has resolved the initial route, so the app shell
// (left nav) never flashes on the bare configurator route.
router.isReady().then(() => app.mount('#app'))
