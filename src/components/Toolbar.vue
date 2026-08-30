<script setup lang="ts">
// Верхняя панель (десктоп). Все кнопки — плитки одного размера (.tile),
// сгруппированы по смыслу: режимы / действия / вид. Отличается только
// состояние: режим — заливка, тумблер вида — приглушённая подсветка.
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '../stores/configurator'
import ModeSwitch from './ModeSwitch.vue'
import {
  IconUndo, IconRedo, IconDelete,
  IconGrid, IconDimensions, IconTriangles, IconSnap, IconFit, IconPlus, IconHelp,
} from '../icons'

const { t } = useI18n()
const store = useConfigurator()
const { settings, past, future, selectedPointId, selectedEdgeKey } = storeToRefs(store)

defineEmits<{ (e: 'fit'): void; (e: 'new'): void; (e: 'help'): void }>()

function del() {
  if (selectedPointId.value || selectedEdgeKey.value) store.deleteSelected()
  else store.deleteActiveShape()
}
const delTitle = () => selectedPointId.value
  ? t('toolbar.deleteCorner')
  : selectedEdgeKey.value ? t('toolbar.deleteEdge') : t('toolbar.deleteShape')
</script>

<template>
  <div class="toolbar">
    <button class="btn-primary" data-tour="new" @click="$emit('new')">
      <IconPlus :size="18" :stroke-width="2" />{{ t('toolbar.newCeiling') }}
    </button>

    <ModeSwitch data-tour="modes" />

    <!-- действия -->
    <div class="tool-group">
      <button class="tile" :disabled="!past.length" :title="t('toolbar.undoHint')" @click="store.undo()">
        <IconUndo :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.undo') }}</span>
      </button>
      <button class="tile" :disabled="!future.length" :title="t('toolbar.redoHint')" @click="store.redo()">
        <IconRedo :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.redo') }}</span>
      </button>
      <button class="tile danger" :title="delTitle()" @click="del()">
        <IconDelete :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.delete') }}</span>
      </button>
    </div>

    <!-- вид -->
    <div class="tool-group">
      <button class="tile toggle" :class="{ on: settings.showGrid }" :title="t('toolbar.gridHint')"
        @click="store.updateSettings({ showGrid: !settings.showGrid })">
        <IconGrid :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.grid') }}</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.showMeasures }" :title="t('toolbar.dimsHint')"
        @click="store.updateSettings({ showMeasures: !settings.showMeasures })">
        <IconDimensions :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.dims') }}</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.showTriangles }" :title="t('toolbar.trianglesHint')"
        @click="store.updateSettings({ showTriangles: !settings.showTriangles })">
        <IconTriangles :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.triangles') }}</span>
      </button>
      <button class="tile toggle" :class="{ on: settings.snap }" :title="t('toolbar.snapHint')"
        @click="store.updateSettings({ snap: !settings.snap })">
        <IconSnap :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.snap') }}</span>
      </button>
      <button class="tile" :title="t('toolbar.fitHint')" @click="$emit('fit')">
        <IconFit :size="18" :stroke-width="1.75" /><span>{{ t('toolbar.fit') }}</span>
      </button>
    </div>

    <div class="spacer"></div>

    <button class="btn-ghost" @click="$emit('help')">
      <IconHelp :size="18" :stroke-width="1.75" />{{ t('toolbar.help') }}
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
