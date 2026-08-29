<script setup lang="ts">
// Верхняя панель (десктоп). Все кнопки — плитки одного размера (.tile),
// сгруппированы по смыслу: режимы / действия / вид. Отличается только
// состояние: режим — заливка, тумблер вида — приглушённая подсветка.
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import ModeSwitch from './ModeSwitch.vue'
import {
  IconUndo, IconRedo, IconDelete,
  IconGrid, IconDimensions, IconTriangles, IconSnap, IconFit, IconPlus, IconHelp,
} from '../icons'

const store = useConfigurator()
const { settings, past, future, selectedPointId, selectedEdgeKey } = storeToRefs(store)

defineEmits<{ (e: 'fit'): void; (e: 'new'): void; (e: 'help'): void }>()

function del() {
  if (selectedPointId.value || selectedEdgeKey.value) store.deleteSelected()
  else store.deleteActiveShape()
}
const delTitle = () => selectedPointId.value
  ? 'Удалить угол (Del)'
  : selectedEdgeKey.value ? 'Убрать сторону (Del)' : 'Удалить фигуру'
</script>

<template>
  <div class="toolbar">
    <button class="btn-primary" data-tour="new" @click="$emit('new')">
      <IconPlus :size="18" :stroke-width="2" />Новый потолок
    </button>

    <ModeSwitch data-tour="modes" />

    <!-- действия -->
    <div class="tool-group">
      <button class="tile" :disabled="!past.length" title="Отменить (Ctrl+Z)" @click="store.undo()">
        <IconUndo :size="18" :stroke-width="1.75" /><span>Отмена</span>
      </button>
      <button class="tile" :disabled="!future.length" title="Повторить (Ctrl+Y)" @click="store.redo()">
        <IconRedo :size="18" :stroke-width="1.75" /><span>Повтор</span>
      </button>
      <button class="tile danger" :title="delTitle()" @click="del()">
        <IconDelete :size="18" :stroke-width="1.75" /><span>Удалить</span>
      </button>
    </div>

    <!-- вид -->
    <div class="tool-group">
      <button class="tile toggle" :class="{ on: settings.showGrid }" title="Сетка (G)"
        @click="store.updateSettings({ showGrid: !settings.showGrid })">
        <IconGrid :size="18" :stroke-width="1.75" /><span>Сетка</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.showMeasures }" title="Размеры и углы (M)"
        @click="store.updateSettings({ showMeasures: !settings.showMeasures })">
        <IconDimensions :size="18" :stroke-width="1.75" /><span>Размеры</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.showTriangles }" title="Треугольники замера"
        @click="store.updateSettings({ showTriangles: !settings.showTriangles })">
        <IconTriangles :size="18" :stroke-width="1.75" /><span>Треуг.</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.snap }" title="Привязка: вершины, оси, шаг сетки (S)"
        @click="store.updateSettings({ snap: !settings.snap })">
        <IconSnap :size="18" :stroke-width="1.75" /><span>Привязка</span>
      </button>
      <button class="tile" title="Вписать в экран" @click="$emit('fit')">
        <IconFit :size="18" :stroke-width="1.75" /><span>Вписать</span>
      </button>
    </div>

    <div class="spacer"></div>

    <button class="btn-ghost" @click="$emit('help')">
      <IconHelp :size="18" :stroke-width="1.75" />Как это работает
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bar);
  border-bottom: 1px solid var(--border-soft);
}
.spacer { flex: 1; }
</style>
