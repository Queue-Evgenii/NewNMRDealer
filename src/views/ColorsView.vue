<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from '../components/DataTable.vue'
import { api, colorRgb } from '../api'
import type { MColor } from '../api/types'

const rows = ref<MColor[]>([])
const loading = ref(true)
onMounted(async () => { rows.value = await api.listColors(); loading.value = false })

const columns = [
  { key: 'Id_Color', label: 'ID', width: '70px' },
  { key: 'Name', label: 'Цвет', format: (r: MColor) => r.Name || '—', swatch: (r: MColor) => colorRgb(r.cod) },
  { key: 'cod', label: 'Код RGB', width: '140px', format: (r: MColor) => colorRgb(r.cod) },
]
</script>

<template>
  <div class="view">
    <header class="view-head"><h1>Каталог цветов</h1></header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="Id_Color" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { padding: 14px 18px; } h1 { margin: 0; font-size: 18px; }
</style>
