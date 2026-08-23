<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from './Toolbar.vue'
import SidePanel from './SidePanel.vue'
import CeilingCanvas2D from './CeilingCanvas2D.vue'
import CeilingView3D from './CeilingView3D.vue'
import NewCeilingDialog from './NewCeilingDialog.vue'
import HelpOverlay from './HelpOverlay.vue'
import { useShortcuts } from '../composables/useShortcuts'

useShortcuts()
const tab = ref<'2d' | '3d'>('2d')
const canvasRef = ref<InstanceType<typeof CeilingCanvas2D> | null>(null)
const showNew = ref(false)
const showHelp = ref(false)
</script>

<template>
  <div class="ws">
    <div class="ws-head">
      <div class="tabs">
        <button :class="{ on: tab === '2d' }" @click="tab = '2d'">2D чертёж</button>
        <button :class="{ on: tab === '3d' }" @click="tab = '3d'">3D вид</button>
      </div>
    </div>

    <Toolbar v-show="tab === '2d'"
      @fit="canvasRef?.fit()" @new="showNew = true" @help="showHelp = true" />

    <div class="ws-body">
      <div class="stage">
        <CeilingCanvas2D v-show="tab === '2d'" ref="canvasRef" />
        <CeilingView3D v-if="tab === '3d'" />
      </div>
      <SidePanel />
    </div>

    <NewCeilingDialog v-if="showNew" @close="showNew = false" />
    <HelpOverlay v-if="showHelp" @close="showHelp = false" />
  </div>
</template>

<style scoped>
.ws { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ws-head { display: flex; align-items: center; padding: 8px 12px; background: #0b1120; border-bottom: 1px solid #223; }
.tabs { display: flex; gap: 4px; }
.tabs button {
  padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 14px;
  background: #1b2436; color: #cbd5e1; border: 1px solid #2a3550;
}
.tabs button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.ws-body { flex: 1; display: flex; min-height: 0; }
.stage { flex: 1; min-width: 0; position: relative; }
@media (max-width: 720px) {
  .ws-body { flex-direction: column; }
  .stage { min-height: 52vh; }
}
</style>
