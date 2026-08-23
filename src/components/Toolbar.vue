<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'

const store = useConfigurator()
const { tool, settings, activeShape, past, future } = storeToRefs(store)

defineEmits<{ (e: 'fit'): void; (e: 'new'): void; (e: 'help'): void }>()
</script>

<template>
  <div class="toolbar">
    <div class="cta-group">
      <button class="cta" @click="$emit('new')">＋ Новый потолок</button>
    </div>

    <div class="sep"></div>

    <!-- drawing tools (ToolNewDot / select / ruler) -->
    <div class="group">
      <button :class="{ on: tool === 'select' }" @click="store.setTool('select')">
        <i>⭤</i><span>Выбор</span></button>
      <button :class="{ on: tool === 'add' }" @click="store.setTool('add')">
        <i>＋</i><span>Добавить</span></button>
      <button :class="{ on: tool === 'ruler' }" @click="store.setTool('ruler')">
        <i>📏</i><span>Линейка</span></button>
      <button @click="store.deleteSelected()">
        <i>🗑</i><span>Удалить</span></button>
    </div>

    <!-- history -->
    <div class="group">
      <button :disabled="!past.length" @click="store.undo()"><i>↶</i><span>Отмена</span></button>
      <button :disabled="!future.length" @click="store.redo()"><i>↷</i><span>Повтор</span></button>
    </div>

    <!-- shape ops -->
    <div class="group">
      <button @click="store.beginNewShape()"><i>◳</i><span>Фигура</span></button>
      <button :class="{ on: activeShape.closed }" @click="store.toggleClosed()"><i>⬠</i><span>Контур</span></button>
      <button @click="store.mirror('h')"><i>⇋</i><span>Зеркало</span></button>
    </div>

    <!-- view -->
    <div class="group">
      <button :class="{ on: settings.showGrid }" @click="store.updateSettings({ showGrid: !settings.showGrid })">
        <i>▦</i><span>Сетка</span></button>
      <button :class="{ on: settings.showMeasures }" @click="store.updateSettings({ showMeasures: !settings.showMeasures })">
        <i>↔</i><span>Размеры</span></button>
      <button :class="{ on: settings.snap }" @click="store.updateSettings({ snap: !settings.snap })">
        <i>◈</i><span>Привязка</span></button>
      <button @click="$emit('fit')"><i>⤢</i><span>Вписать</span></button>
    </div>

    <div class="spacer"></div>
    <button class="help" @click="$emit('help')"><i class="q">?</i><span>Как это работает</span></button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: stretch; flex-wrap: wrap; gap: 8px;
  padding: 8px 12px; background: #101828; border-bottom: 1px solid #223;
}
.help {
  display: flex; align-items: center; gap: 8px;
  padding: 0 14px; border-radius: 9px; cursor: pointer; font-size: 13px;
  background: #1b2436; border: 1px solid #2a3550; color: #9fb3d6;
}
.help .q {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%; font-style: normal; font-size: 12px;
  background: #2f6fed; color: #fff;
}
.sep { width: 1px; background: #263250; margin: 2px 2px; }
.spacer { flex: 1; }
.group, .cta-group { display: flex; gap: 3px; padding: 4px; border-radius: 10px; }
.group { background: #0d1320; }
.group button {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 58px; padding: 5px 4px; color: #cbd5e1; background: transparent;
  border: 1px solid transparent; border-radius: 7px; cursor: pointer;
}
.group button i { font-size: 18px; font-style: normal; line-height: 1; }
.group button span { font-size: 11px; }
.group button:hover:not(:disabled) { background: #1b2436; }
.group button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.group button:disabled { opacity: 0.35; cursor: default; }
.cta-group .cta {
  padding: 0 16px; border-radius: 9px; cursor: pointer; font-size: 14px; font-weight: 600;
  background: #2f6fed; border: none; color: #fff;
}
</style>
