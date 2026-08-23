<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from '../components/DataTable.vue'
import { api } from '../api'
import type { Faktura } from '../api/types'

const rows = ref<Faktura[]>([])
const loading = ref(true)
onMounted(async () => { rows.value = await api.listFilms(); loading.value = false })

const columns = [
  { key: 'Id_faktura', label: 'ID', width: '70px' },
  { key: 'Name', label: 'Полотно / фактура', format: (r: Faktura) => r.Name || '—' },
  { key: 'Sfakt', label: 'Ширина, см', width: '110px', format: (r: Faktura) => String(r.Sfakt ?? '—') },
  { key: 'Kpr', label: 'Коэф.', width: '90px', format: (r: Faktura) => String(r.Kpr ?? '—') },
  { key: 'price', label: 'Цена', width: '90px', format: (r: Faktura) => String(r.price ?? '—') },
  { key: 'priced', label: 'Цена дилер', width: '110px', format: (r: Faktura) => String(r.priced ?? '—') },
]
</script>

<template>
  <div class="view">
    <header class="view-head"><h1>Полотна и цены</h1></header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="Id_faktura" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { padding: 14px 18px; } h1 { margin: 0; font-size: 18px; }
</style>
