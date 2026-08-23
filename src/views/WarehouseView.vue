<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import DataTable from '../components/DataTable.vue'
import { api, filmName, colorName } from '../api'
import type { Component, Sclad } from '../api/types'

const sclads = ref<Sclad[]>([])
const current = ref<number | undefined>(undefined)
const rows = ref<Component[]>([])
const loading = ref(true)

onMounted(async () => {
  sclads.value = await api.listWarehouses()
  await load()
})
watch(current, load)

async function load() {
  loading.value = true
  rows.value = await api.listComponents(current.value)
  loading.value = false
}

const columns = [
  { key: 'namecomp', label: 'Компонент', format: (r: Component) => r.namecomp || '—' },
  { key: 'id_faktura', label: 'Полотно', format: (r: Component) => filmName(r.id_faktura) },
  { key: 'id_color', label: 'Цвет', format: (r: Component) => colorName(r.id_color) },
  { key: 'LAll', label: 'Всего', width: '90px', format: (r: Component) => String(r.LAll ?? 0) },
  { key: 'LOst', label: 'Остаток', width: '90px', format: (r: Component) => String(r.LOst ?? 0) },
  { key: 'Lrezerv', label: 'Резерв', width: '90px', format: (r: Component) => String(r.Lrezerv ?? 0) },
  { key: 'edizmer', label: 'Ед.', width: '70px', format: (r: Component) => r.edizmer || '—' },
]
</script>

<template>
  <div class="view">
    <header class="view-head">
      <h1>Склад</h1>
      <select v-model="current">
        <option :value="undefined">Все склады</option>
        <option v-for="s in sclads" :key="s.id_sclad" :value="s.id_sclad">{{ s.namesclad }}</option>
      </select>
    </header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="id_index" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; }
h1 { margin: 0; font-size: 18px; }
select { background: #0d1320; border: 1px solid #2a3550; color: #e8eefc; border-radius: 7px; padding: 8px 11px; font-size: 14px; }
</style>
