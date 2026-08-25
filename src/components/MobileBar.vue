<script setup lang="ts">
// Плавающие кнопки поверх холста на телефоне: слева — «новый потолок»
// и справка, справа — история и зум. Остальное живёт в нижней шторке.
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { IconPlus, IconMinus, IconHelp, IconUndo, IconRedo, IconFit } from '../icons'

const store = useConfigurator()
const { past, future } = storeToRefs(store)

defineEmits<{
  (e: 'fit'): void
  (e: 'zoom', factor: number): void
  (e: 'new'): void
  (e: 'help'): void
}>()
</script>

<template>
  <div class="left">
    <button class="fab primary" title="Новый потолок" @click="$emit('new')">
      <IconPlus :size="22" :stroke-width="2" />
    </button>
    <button class="fab" title="Как это работает" @click="$emit('help')">
      <IconHelp :size="20" :stroke-width="1.75" />
    </button>
  </div>
  <div class="right">
    <button class="fab" :disabled="!past.length" title="Отменить" @click="store.undo()">
      <IconUndo :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" :disabled="!future.length" title="Повторить" @click="store.redo()">
      <IconRedo :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" title="Вписать" @click="$emit('fit')">
      <IconFit :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" title="Приблизить" @click="$emit('zoom', 1.35)">
      <IconPlus :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" title="Отдалить" @click="$emit('zoom', 1 / 1.35)">
      <IconMinus :size="20" :stroke-width="1.75" />
    </button>
  </div>
</template>

<style scoped>
.left, .right { position: absolute; top: 10px; display: flex; flex-direction: column; gap: 8px; z-index: 5; }
.left { left: 10px; }
.right { right: 10px; }
.fab {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 12px; cursor: pointer;
  background: rgba(13, 19, 32, 0.94); border: 1px solid #2a3550; color: #cbd5e1;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.fab.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.fab:disabled { opacity: 0.32; }
.fab:active:not(:disabled) { transform: scale(0.94); }
</style>
