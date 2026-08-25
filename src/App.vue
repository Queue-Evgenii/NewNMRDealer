<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'
import {
  IconDashboard, IconOrders, IconDraw, IconClients, IconFilms,
  IconColors, IconWarehouse, IconUsers, IconLogo, IconLogout,
} from './icons'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

// Treat the bare configurator (and any not-yet-resolved route) as chrome-less,
// so the left app-nav shell only shows on real /app/* windows.
const bare = computed(() => route.meta.bare === true || !route.name)

const nav = [
  { name: 'dashboard', label: 'Рабочий стол', icon: IconDashboard },
  { name: 'orders', label: 'Заказы', icon: IconOrders },
  { name: 'app-constructor', label: 'Конструктор', icon: IconDraw },
  { name: 'clients', label: 'Клиенты', icon: IconClients },
  { name: 'films', label: 'Полотна и цены', icon: IconFilms },
  { name: 'colors', label: 'Цвета', icon: IconColors },
  { name: 'warehouse', label: 'Склад', icon: IconWarehouse },
  { name: 'users', label: 'Пользователи', icon: IconUsers },
]

function isActive(name: string) {
  return route.name === name || (name === 'orders' && route.name === 'order')
}
function logout() { auth.logout(); router.push({ name: 'login' }) }
</script>

<template>
  <router-view v-if="bare" />

  <div v-else class="shell">
    <aside class="side">
      <div class="brand"><IconLogo class="logo" :size="20" :stroke-width="1.75" /> NMR Dealer</div>
      <nav>
        <button v-for="n in nav" :key="n.name" :class="{ on: isActive(n.name) }" @click="router.push({ name: n.name })">
          <component :is="n.icon" :size="18" :stroke-width="1.75" /><span>{{ n.label }}</span>
        </button>
      </nav>
      <div class="user" v-if="auth.user">
        <div class="who"><b>{{ auth.user.name }}</b><small>{{ auth.user.uslog }}</small></div>
        <button class="logout" @click="logout" title="Выход">
          <IconLogout :size="17" :stroke-width="1.75" />
        </button>
      </div>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100vh; height: 100dvh; }
.side { width: 230px; flex: 0 0 230px; background: #0b1120; border-right: 1px solid #1b2740; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 9px; padding: 16px 18px; font-weight: 700; color: #e8eefc; border-bottom: 1px solid #1b2740; }
.logo { color: #2f6fed; }
nav { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; }
nav button { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 9px; border: none; background: transparent; color: #aeb9d0; cursor: pointer; font-size: 14px; text-align: left; }
nav button svg { flex: 0 0 auto; opacity: 0.9; }
nav button:hover { background: #131d33; color: #e8eefc; }
nav button.on { background: #2f6fed; color: #fff; }
.user { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid #1b2740; }
.who { flex: 1; display: flex; flex-direction: column; line-height: 1.2; }
.who small { color: #7f90b0; font-size: 12px; }
.logout { background: #1b2436; border: 1px solid #2a3550; color: #cbd5e1; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; }
.content { flex: 1; min-width: 0; overflow: hidden; background: #0f1420; }

@media (max-width: 720px) {
  .side { width: 64px; flex-basis: 64px; }
  .brand { font-size: 0; padding: 16px 0; text-align: center; }
  .brand .logo { font-size: 20px; }
  nav button span, .who { display: none; }
  nav button { justify-content: center; }
}
</style>
