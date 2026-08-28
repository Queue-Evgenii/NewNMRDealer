<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConstructorWorkspace from '../components/ConstructorWorkspace.vue'
import { api, filmName, colorName, statusName } from '../api'
import type { Order, Faktura, MColor, Status } from '../api/types'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => route.params.id === 'new')
const order = ref<Order | null>(null)
const films = ref<Faktura[]>([])
const colors = ref<MColor[]>([])
const statuses = ref<Status[]>([])
const tab = ref<'params' | 'draw'>('params')
const loading = ref(true)

onMounted(async () => {
  ;[films.value, colors.value, statuses.value] = await Promise.all([
    api.listFilms(), api.listColors(), api.listStatuses(),
  ])
  if (isNew.value) {
    order.value = {
      Id_zakaz: 0, Numzak: null, numzaks: '', Id_Client: null, company: '', nik: '',
      Id_faktura: films.value[0]?.Id_faktura ?? null, Id_color: colors.value[0]?.Id_Color ?? null,
      ZakDate: new Date().toISOString().slice(0, 10), dateplan: null,
      SForm: 0, PForm: 0, Nang: 4, statezak: 1, Status: 0, allprice: 0, prim: '',
    }
  } else {
    order.value = (await api.getOrder(Number(route.params.id))) ?? null
  }
  loading.value = false
})

const title = computed(() =>
  isNew.value ? 'Новый заказ' : `Заказ № ${order.value?.numzaks || order.value?.Numzak || route.params.id}`,
)
</script>

<template>
  <div class="view" v-if="order">
    <header class="view-head">
      <div class="crumbs">
        <a @click="router.push({ name: 'orders' })">Заказы</a> <span>/</span> <b>{{ title }}</b>
      </div>
      <div class="tabs">
        <button :class="{ on: tab === 'params' }" @click="tab = 'params'">Параметры</button>
        <button :class="{ on: tab === 'draw' }" @click="tab = 'draw'">Чертёж полотна</button>
      </div>
    </header>

    <div v-show="tab === 'params'" class="params">
      <div class="grid">
        <label>Клиент<input v-model="order.company" /></label>
        <label>№ заказа<input v-model="order.numzaks" /></label>
        <label>Полотно
          <select v-model="order.Id_faktura">
            <option v-for="f in films" :key="f.Id_faktura" :value="f.Id_faktura">{{ f.Name }}</option>
          </select>
        </label>
        <label>Цвет
          <select v-model="order.Id_color">
            <option v-for="c in colors" :key="c.Id_Color" :value="c.Id_Color">{{ c.Name }}</option>
          </select>
        </label>
        <label>Дата заказа<input type="date" v-model="order.ZakDate" /></label>
        <label>Статус
          <select v-model="order.statezak">
            <option v-for="s in statuses" :key="s.id_statzak" :value="s.id_statzak">{{ s.StatusZak }}</option>
          </select>
        </label>
        <label>Площадь S, м²<input type="number" v-model.number="order.SForm" /></label>
        <label>Периметр P, м<input type="number" v-model.number="order.PForm" /></label>
        <label>Углов<input type="number" v-model.number="order.Nang" /></label>
        <label class="wide">Примечание<textarea v-model="order.prim" rows="2"></textarea></label>
      </div>
      <div class="readout">
        <div><span>Полотно</span><b>{{ filmName(order.Id_faktura) }}</b></div>
        <div><span>Цвет</span><b>{{ colorName(order.Id_color) }}</b></div>
        <div><span>Статус</span><b>{{ statusName(order.statezak) }}</b></div>
      </div>
      <div class="actions">
        <button class="ghost" @click="router.push({ name: 'orders' })">Назад</button>
        <button class="primary" @click="tab = 'draw'">Перейти к чертежу →</button>
      </div>
    </div>

    <div v-show="tab === 'draw'" class="draw">
      <ConstructorWorkspace />
    </div>
  </div>
  <div v-else class="view empty">Загрузка…</div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border-soft); }
.crumbs { font-size: 14px; color: var(--muted); }
.crumbs a { color: #5aa0ff; cursor: pointer; }
.crumbs b { color: var(--text-strong); }
.tabs { display: flex; gap: 4px; }
.tabs button { padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; background: var(--btn); color: var(--text); border: 1px solid var(--border); }
.tabs button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.params { padding: 18px; overflow: auto; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 900px; }
.grid label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
.grid .wide { grid-column: 1 / -1; }
.grid input, .grid select, .grid textarea {
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong); border-radius: 7px; padding: 8px 10px; font-size: 14px;
}
.readout { display: flex; gap: 24px; margin: 20px 0; padding: 14px; background: #101a2e; border-radius: 10px; max-width: 900px; }
.readout span { display: block; font-size: 11px; color: var(--muted); }
.readout b { font-size: 15px; }
.actions { display: flex; gap: 10px; max-width: 900px; }
.actions button { padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; border: 1px solid var(--border); }
.ghost { background: transparent; color: var(--text); }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.draw { flex: 1; min-height: 0; }
.empty { align-items: center; justify-content: center; color: #6b7ea0; }
</style>
