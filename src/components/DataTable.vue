<script setup lang="ts" generic="T extends Record<string, any>">
import { ref, computed } from 'vue'

interface Column {
  key: string
  label: string
  width?: string
  format?: (row: T) => string
  swatch?: (row: T) => string // returns a color to show as a chip
}

const props = defineProps<{
  rows: T[]
  columns: Column[]
  loading?: boolean
  rowKey: keyof T
}>()
const emit = defineEmits<{ (e: 'select', row: T): void }>()

const query = ref('')
const selected = ref<unknown>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.rows
  return props.rows.filter((r) =>
    props.columns.some((c) => {
      const v = c.format ? c.format(r) : r[c.key]
      return String(v ?? '').toLowerCase().includes(q)
    }),
  )
})

function cell(row: T, c: Column): string {
  return c.format ? c.format(row) : String(row[c.key] ?? '—')
}
function pick(row: T) {
  selected.value = row[props.rowKey]
  emit('select', row)
}
</script>

<template>
  <div class="dt">
    <div class="dt-toolbar">
      <input v-model="query" class="search" placeholder="Поиск…" />
      <span class="count">{{ filtered.length }} / {{ rows.length }}</span>
    </div>
    <div class="dt-scroll">
      <table>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :style="c.width ? { width: c.width } : {}">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td :colspan="columns.length" class="empty">Загрузка…</td></tr>
          <tr v-else-if="!filtered.length"><td :colspan="columns.length" class="empty">Нет данных</td></tr>
          <tr v-for="row in filtered" :key="String(row[rowKey])"
            :class="{ sel: selected === row[rowKey] }" @click="pick(row)">
            <td v-for="c in columns" :key="c.key">
              <span v-if="c.swatch" class="swatch" :style="{ background: c.swatch(row) }"></span>
              {{ cell(row, c) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.dt { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dt-toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border-soft); }
.search {
  flex: 1; max-width: 320px; background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 7px; padding: 8px 11px; font-size: 14px;
}
.count { color: var(--muted-2); font-size: 13px; }
.dt-scroll { flex: 1; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th {
  position: sticky; top: 0; background: var(--bar); color: var(--muted); text-align: left;
  padding: 9px 12px; font-weight: 600; border-bottom: 1px solid var(--border-soft); white-space: nowrap;
}
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--row); color: var(--text); white-space: nowrap; }
tbody tr { cursor: pointer; }
tbody tr:hover { background: var(--row-hover); }
tbody tr.sel { background: var(--row-sel); }
.empty { text-align: center; color: var(--muted-2); padding: 30px; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: middle; border: 1px solid #0006; }
</style>
