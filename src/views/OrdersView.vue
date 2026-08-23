<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from '../components/DataTable.vue'
import { api, filmName, colorName, statusName } from '../api'
import type { Order } from '../api/types'

const router = useRouter()
const rows = ref<Order[]>([])
const loading = ref(true)

onMounted(async () => {
  rows.value = await api.listOrders()
  loading.value = false
})

const columns = [
  { key: 'numzaks', label: '№ заказа', width: '120px', format: (r: Order) => r.numzaks || String(r.Numzak ?? r.Id_zakaz) },
  { key: 'company', label: 'Клиент', format: (r: Order) => r.company || r.nik || '—' },
  { key: 'Id_faktura', label: 'Полотно', format: (r: Order) => filmName(r.Id_faktura) },
  { key: 'Id_color', label: 'Цвет', format: (r: Order) => colorName(r.Id_color) },
  { key: 'SForm', label: 'S, м²', width: '90px', format: (r: Order) => (r.SForm ?? 0).toFixed(2) },
  { key: 'PForm', label: 'P, м', width: '90px', format: (r: Order) => (r.PForm ?? 0).toFixed(2) },
  { key: 'Nang', label: 'Углов', width: '80px', format: (r: Order) => String(r.Nang ?? '—') },
  { key: 'ZakDate', label: 'Дата', width: '110px', format: (r: Order) => r.ZakDate || '—' },
  { key: 'statezak', label: 'Статус', width: '130px', format: (r: Order) => statusName(r.statezak) },
]

function open(row: Order) {
  router.push(`/orders/${row.Id_zakaz}`)
}
</script>

<template>
  <div class="view">
    <header class="view-head">
      <h1>Заказы</h1>
      <button class="primary" @click="router.push('/orders/new')">＋ Новый заказ</button>
    </header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="Id_zakaz" @select="open" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; }
h1 { margin: 0; font-size: 18px; }
.primary { padding: 9px 16px; border-radius: 8px; background: #2f6fed; border: none; color: #fff; cursor: pointer; font-weight: 600; }
</style>
