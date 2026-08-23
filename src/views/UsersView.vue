<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from '../components/DataTable.vue'
import { api } from '../api'
import type { User } from '../api/types'

const rows = ref<User[]>([])
const loading = ref(true)
onMounted(async () => { rows.value = await api.listUsers(); loading.value = false })

const groups: Record<number, string> = { 1: 'Администратор', 2: 'Менеджер', 3: 'Дилер' }
const columns = [
  { key: 'id_man', label: 'ID', width: '70px' },
  { key: 'name', label: 'Имя', format: (r: User) => r.name || '—' },
  { key: 'uslog', label: 'Логин', format: (r: User) => r.uslog || '—' },
  { key: 'id_group', label: 'Роль', format: (r: User) => groups[r.id_group ?? 0] || '—' },
  { key: 'status', label: 'Статус', width: '110px', format: (r: User) => (r.status === 0 ? 'Активен' : 'Заблокирован') },
]
</script>

<template>
  <div class="view">
    <header class="view-head"><h1>Пользователи</h1></header>
    <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="id_man" />
  </div>
</template>

<style scoped>
.view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.view-head { padding: 14px 18px; } h1 { margin: 0; font-size: 18px; }
</style>
