<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { IconOrders, IconClients, IconFilms, IconColors, IconWarehouse, IconDraw } from '../icons'

const router = useRouter()
const stats = ref({ orders: 0, clients: 0, films: 0, colors: 0, components: 0 })

onMounted(async () => {
  const [o, c, f, m, k] = await Promise.all([
    api.listOrders(), api.listClients(), api.listFilms(), api.listColors(), api.listComponents(),
  ])
  stats.value = { orders: o.length, clients: c.length, films: f.length, colors: m.length, components: k.length }
})

const cards = [
  { key: 'orders', label: 'Заказы', to: 'orders', icon: IconOrders },
  { key: 'clients', label: 'Клиенты', to: 'clients', icon: IconClients },
  { key: 'films', label: 'Полотна', to: 'films', icon: IconFilms },
  { key: 'colors', label: 'Цвета', to: 'colors', icon: IconColors },
  { key: 'components', label: 'Склад', to: 'warehouse', icon: IconWarehouse },
]
</script>

<template>
  <div class="dash">
    <h1>Рабочий стол</h1>
    <p class="sub">Данные загружены из оригинальной базы (mdes.mdb) через сервисный слой.</p>
    <div class="cards">
      <button v-for="c in cards" :key="c.key" class="card" @click="router.push({ name: c.to })">
        <div class="icon"><component :is="c.icon" :size="24" :stroke-width="1.6" /></div>
        <div class="num">{{ (stats as any)[c.key] }}</div>
        <div class="label">{{ c.label }}</div>
      </button>
      <button class="card accent" @click="router.push({ name: 'app-constructor' })">
        <div class="icon"><IconDraw :size="24" :stroke-width="1.6" /></div>
        <div class="num">2D / 3D</div>
        <div class="label">Конструктор полотна</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dash { padding: 26px; }
h1 { margin: 0; font-size: 22px; }
.sub { color: #8fa3c4; margin: 6px 0 22px; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; max-width: 900px; }
.card { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 18px; background: #121a2c; border: 1px solid #263250; border-radius: 14px; cursor: pointer; color: #e8eefc; text-align: left; }
.card:hover { border-color: #2f6fed; }
.card.accent { background: #16233f; }
.icon { display: flex; color: #7fa9ff; }
.num { font-size: 26px; font-weight: 700; }
.label { color: #8fa3c4; font-size: 13px; }
</style>
