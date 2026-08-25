<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMediaQuery } from '@vueuse/core'
import { useConfigurator } from '../stores/configurator'
import Toolbar from './Toolbar.vue'
import ModeSwitch from './ModeSwitch.vue'
import MobileBar from './MobileBar.vue'
import PanelSheet from './PanelSheet.vue'
import SidePanel from './SidePanel.vue'
import TrianglesPanel from './TrianglesPanel.vue'
import CeilingCanvas2D from './CeilingCanvas2D.vue'
import CeilingView3D from './CeilingView3D.vue'
import NewCeilingDialog from './NewCeilingDialog.vue'
import HelpOverlay from './HelpOverlay.vue'
import { useShortcuts } from '../composables/useShortcuts'
import { decodeModel } from '../composables/useShareLink'
import { IconStepBack, IconCheck, IconClose } from '../icons'

useShortcuts()
const store = useConfigurator()
const { tool, activeShape, measureBaseKey } = storeToRefs(store)

const sharedNotice = ref(false)

onMounted(async () => {
  // чертёж мог прийти ссылкой: данные лежат в hash и на сервер не уходят
  const payload = new URLSearchParams(location.hash.split('?')[1] ?? '').get('d')
  if (payload) {
    const model = await decodeModel(payload)
    // адрес чистим в любом случае, чтобы правки не путались с исходной ссылкой
    history.replaceState(null, '', location.href.split('?')[0])
    if (model) {
      store.applyShared(model)
      sharedNotice.value = true
      canvasRef.value?.fit()
      return
    }
  }
  store.load()
})

function keepShared() {
  store.dropBackup()
  sharedNotice.value = false
}
function backToMine() {
  store.restoreBackup()
  sharedNotice.value = false
  canvasRef.value?.fit()
}

const phone = useMediaQuery('(max-width: 900px)')

const TAB_KEY = 'nmr.configurator.tab'
const tab = ref<'2d' | '3d'>(((): '2d' | '3d' => {
  try { return (localStorage.getItem(TAB_KEY) as '2d' | '3d') || '2d' } catch { return '2d' }
})())
watch(tab, (v) => { try { localStorage.setItem(TAB_KEY, v) } catch { /* ignore */ } })

const canvasRef = ref<InstanceType<typeof CeilingCanvas2D> | null>(null)
const showNew = ref(false)
const showHelp = ref(false)

const drawPoints = computed(() => (tool.value === 'draw' ? activeShape.value.points.length : 0))

// одна короткая подсказка на режим — что именно делает нажатие
const hint = computed(() => {
  if (tab.value !== '2d') return ''
  switch (tool.value) {
    case 'draw':
      return drawPoints.value === 0
        ? 'Ставьте углы комнаты по одному. Тяните — холст двигается.'
        : drawPoints.value < 3
          ? 'Ещё точки… Замкнуть можно с трёх углов.'
          : 'Тап по зелёной точке или «Замкнуть» — контур готов.'
    case 'ruler':
      return 'Два тапа — расстояние между ними.'
    case 'measure':
      return activeShape.value.triangles.length
        ? (measureBaseKey.value ? 'Основание выбрано — введите две длины справа.' : 'Тап по стороне — это основание следующего треугольника.')
        : 'Задайте три стороны первого треугольника или разбейте фигуру — справа.'
    default:
      return ''
  }
})
</script>

<template>
  <div class="ws">
    <div class="ws-head">
      <div class="tabs">
        <button :class="{ on: tab === '2d' }" @click="tab = '2d'">2D чертёж</button>
        <button :class="{ on: tab === '3d' }" @click="tab = '3d'">3D вид</button>
      </div>
    </div>

    <Toolbar v-if="!phone && tab === '2d'"
      @fit="canvasRef?.fit()" @new="showNew = true" @help="showHelp = true" />

    <div :class="['ws-body', { phone }]">
      <div class="stage">
        <CeilingCanvas2D v-show="tab === '2d'" ref="canvasRef" />
        <CeilingView3D v-if="tab === '3d'" />

        <div v-if="hint" class="hint">{{ hint }}</div>

        <!-- чертёж открыт по ссылке -->
        <div v-if="sharedNotice" class="shared">
          <span>Открыт чертёж по ссылке.</span>
          <button v-if="store.hasBackup()" @click="backToMine">Вернуть мой</button>
          <button class="primary" @click="keepShared">Оставить</button>
        </div>

        <!-- рисование: явный выход, без угадывания -->
        <div v-if="tool === 'draw' && tab === '2d'" :class="['draw-hud', { phone }]">
          <button :disabled="!drawPoints" @click="store.undoDrawPoint()">
            <IconStepBack :size="16" :stroke-width="1.75" />Точку назад
          </button>
          <button class="primary" :disabled="drawPoints < 3" @click="store.finishDraw(true)">
            <IconCheck :size="16" :stroke-width="2" />Замкнуть
          </button>
          <button @click="store.finishDraw(false)">
            <IconClose :size="16" :stroke-width="1.75" />Готово
          </button>
        </div>

        <template v-if="phone && tab === '2d'">
          <MobileBar @fit="canvasRef?.fit()" @zoom="(f) => canvasRef?.zoomBy(f)"
            @new="showNew = true" @help="showHelp = true" />
          <div class="mode-float"><ModeSwitch compact /></div>
        </template>
      </div>

      <!-- панель справа (десктоп) или шторкой снизу (телефон) -->
      <template v-if="phone">
        <PanelSheet v-if="tab === '2d'">
          <TrianglesPanel v-if="tool === 'measure'" />
          <SidePanel v-else show-view />
        </PanelSheet>
      </template>
      <template v-else>
        <TrianglesPanel v-if="tool === 'measure'" />
        <SidePanel v-else />
      </template>
    </div>

    <NewCeilingDialog v-if="showNew" @close="showNew = false" />
    <HelpOverlay v-if="showHelp" @close="showHelp = false" />
  </div>
</template>

<style scoped>
.ws { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.ws-head { display: flex; align-items: center; padding: 8px 12px; background: #0b1120; border-bottom: 1px solid #223; }
.tabs { display: flex; gap: 4px; }
.tabs button {
  padding: 7px 15px; border-radius: 8px; cursor: pointer; font-size: 14px;
  background: #1b2436; color: #cbd5e1; border: 1px solid #2a3550;
}
.tabs button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }

.ws-body { flex: 1; display: flex; min-height: 0; }
.stage { flex: 1; min-width: 0; position: relative; }
.ws-body.phone { position: relative; display: block; overflow: hidden; }
.ws-body.phone .stage { position: absolute; inset: 0; }

.hint {
  position: absolute; left: 50%; top: 10px; transform: translateX(-50%);
  background: rgba(20, 30, 50, 0.92); border: 1px solid #2f6fed; color: #dbe6ff;
  padding: 6px 14px; border-radius: 20px; font-size: 13px; pointer-events: none;
  max-width: min(90%, 460px); text-align: center; z-index: 4;
}
.ws-body.phone .hint { top: 62px; font-size: 12px; }

.draw-hud {
  position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
  display: flex; gap: 6px; padding: 6px; z-index: 6;
  background: rgba(13, 19, 32, 0.96); border: 1px solid #2a3550; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.draw-hud.phone { bottom: 148px; }
.draw-hud button {
  display: flex; align-items: center; gap: 6px; height: 40px;
  padding: 0 14px; border-radius: 8px; cursor: pointer; font-size: 13px;
  background: #1b2436; border: 1px solid #2a3550; color: #cbd5e1; white-space: nowrap;
}
.draw-hud button.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.draw-hud button:disabled { opacity: 0.35; cursor: default; }

.mode-float { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); z-index: 6; }

.shared {
  position: absolute; left: 50%; top: 10px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; z-index: 7;
  padding: 8px 10px 8px 14px; border-radius: 12px; font-size: 13px; color: #dbe6ff;
  background: rgba(13, 19, 32, 0.96); border: 1px solid #2f6fed;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.shared button {
  padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px;
  background: #1b2436; border: 1px solid #2a3550; color: #cbd5e1; white-space: nowrap;
}
.shared button.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.ws-body.phone .shared { top: 62px; font-size: 12px; }
</style>
