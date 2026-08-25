<script setup lang="ts">
// Переключатель режимов. Один режим = одно поведение холста + своя панель.
// Плитки те же, что и во всей панели инструментов, — размер и стиль общие.
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import type { Tool } from '../stores/configurator'
import { IconSelect, IconDraw, IconRuler, IconMeasure } from '../icons'

defineProps<{ compact?: boolean }>()

const store = useConfigurator()
const { tool } = storeToRefs(store)

const modes = [
  { id: 'select' as Tool, icon: IconSelect, label: 'Выбор', hint: 'Выделять и двигать (V)' },
  { id: 'draw' as Tool, icon: IconDraw, label: 'Рисовать', hint: 'Новый контур по точкам (D)' },
  { id: 'ruler' as Tool, icon: IconRuler, label: 'Линейка', hint: 'Померить расстояние (R)' },
  { id: 'measure' as Tool, icon: IconMeasure, label: 'Замер', hint: 'Метод треугольников (T)' },
]
</script>

<template>
  <div :class="['tool-group', 'modes', { floating: compact }]" role="tablist">
    <button v-for="m in modes" :key="m.id" class="tile" role="tab" :aria-selected="tool === m.id"
      :class="{ on: tool === m.id }" :title="m.hint" @click="store.setTool(m.id)">
      <component :is="m.icon" :size="18" :stroke-width="1.75" />
      <span>{{ m.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* плавающий вариант для телефона — та же сетка, другая подложка */
.modes.floating {
  background: rgba(13, 19, 32, 0.96);
  border-color: #2a3550;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
</style>
