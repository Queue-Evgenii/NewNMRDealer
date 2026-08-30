<script setup lang="ts">
// Плавающие кнопки поверх холста на телефоне: слева — «новый потолок»
// и справка, справа — история и зум. Остальное живёт в нижней шторке.
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { useI18n } from 'vue-i18n'
import { IconPlus, IconMinus, IconHelp, IconUndo, IconRedo, IconFit } from '../icons'

const { t } = useI18n()
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
    <button class="fab primary" data-tour="new" :title="t('mobile.newCeiling')" @click="$emit('new')">
      <IconPlus :size="22" :stroke-width="2" />
    </button>
    <button class="fab" :title="t('mobile.help')" @click="$emit('help')">
      <IconHelp :size="20" :stroke-width="1.75" />
    </button>
  </div>
  <div class="right">
    <button class="fab" :disabled="!past.length" :title="t('mobile.undo')" @click="store.undo()">
      <IconUndo :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" :disabled="!future.length" :title="t('mobile.redo')" @click="store.redo()">
      <IconRedo :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" :title="t('mobile.fit')" @click="$emit('fit')">
      <IconFit :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" :title="t('mobile.zoomIn')" @click="$emit('zoom', 1.35)">
      <IconPlus :size="20" :stroke-width="1.75" />
    </button>
    <button class="fab" :title="t('mobile.zoomOut')" @click="$emit('zoom', 1 / 1.35)">
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
  background: rgba(13, 19, 32, 0.94); border: 1px solid var(--border); color: var(--text);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.fab.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.fab:disabled { opacity: 0.32; }
.fab:active:not(:disabled) { transform: scale(0.94); }
</style>
