<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from '../components/DataTable.vue'
import { api } from '../api'
import type { Client } from '../api/types'

const rows = ref<Client[]>([])
const loading = ref(true)
onMounted(async () => { rows.value = await api.listClients(); loading.value = false })

const columns = [
  { key: 'Id_Client', label: 'ID', width: '60px' },
  { key: 'Company', label: 'Компания', format: (r: Client) => r.Company || r.Nik || '—' },
  { key: 'Gorod', label: 'Город', format: (r: Client) => r.Gorod || '—' },
  { key: 'Tel', label: 'Телефон', format: (r: Client) => r.Tel || '—' },
  { key: 'Email', label: 'E-mail', format: (r: Client) => r.Email || '—' },
  { key: 'balance', label: 'Баланс', width: '100px', format: (r: Client) => String(r.balance ?? 0) },
]
</script>

<template>
  <div class="view">
    <header class="view-head"><h1>Клиенты</h1></header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="Id_Client" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { padding: 14px 18px; } h1 { margin: 0; font-size: 18px; }
</style>
