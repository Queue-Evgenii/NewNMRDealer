<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const bare = computed(() => route.meta.bare === true)

const nav = [
  { name: 'dashboard', label: 'Рабочий стол', icon: '▦' },
  { name: 'orders', label: 'Заказы', icon: '📋' },
  { name: 'app-constructor', label: 'Конструктор', icon: '✎' },
  { name: 'clients', label: 'Клиенты', icon: '👤' },
  { name: 'films', label: 'Полотна и цены', icon: '🎞' },
  { name: 'colors', label: 'Цвета', icon: '🎨' },
  { name: 'warehouse', label: 'Склад', icon: '📦' },
  { name: 'users', label: 'Пользователи', icon: '🛡' },
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
      <div class="brand"><span class="logo">◈</span> NMR Dealer</div>
      <nav>
        <button v-for="n in nav" :key="n.name" :class="{ on: isActive(n.name) }" @click="router.push({ name: n.name })">
          <i>{{ n.icon }}</i><span>{{ n.label }}</span>
        </button>
      </nav>
      <div class="user" v-if="auth.user">
        <div class="who"><b>{{ auth.user.name }}</b><small>{{ auth.user.uslog }}</small></div>
        <button class="logout" @click="logout" title="Выход">⏻</button>
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
.brand { padding: 16px 18px; font-weight: 700; color: #e8eefc; border-bottom: 1px solid #1b2740; }
.logo { color: #2f6fed; }
nav { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; }
nav button { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 9px; border: none; background: transparent; color: #aeb9d0; cursor: pointer; font-size: 14px; text-align: left; }
nav button i { font-style: normal; width: 20px; text-align: center; }
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
