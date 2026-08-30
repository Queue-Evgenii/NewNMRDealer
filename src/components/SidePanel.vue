<script setup lang="ts">
/**
 * Панель МВП: только то, что показывают клиенту — метраж и цена по чертежу и
 * по выбранному полотну, — плюс настройки самого полотна. Цена считается по
 * статичному прайсу (src/pricing.ts).
 *
 * На телефоне эта же панель живёт в нижней шторке, поэтому тумблеры вида и
 * основные действия появляются здесь (showView) — панели инструментов там нет.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { CURRENCY } from '../pricing'
import { arcSagitta } from '../composables/useArcs'
import { buildShareLink } from '../composables/useShareLink'
import { cornerLabel, sideLabel } from '../labels'
import {
  IconGrid, IconDimensions, IconTriangles, IconSnap,
  IconUndo, IconRedo, IconDraw, IconDelete,
} from '../icons'

defineProps<{ showView?: boolean }>()
// окно цвета открывает рабочая область — см. ConstructorWorkspace
const emit = defineEmits<{ (e: 'color'): void }>()

const { t } = useI18n()
const store = useConfigurator()
const {
  totals, activeStats, activeShape, shapes, shapeStats, hostOfActive,
  activeEdges, selectedEdgeKey, settings, past, future, selectedPointId, selectedPoint, angles,
} = storeToRefs(store)

/** Выбранный угол: буква, координаты и градус — всё правится числами. */
const cornerIndex = computed(() =>
  activeShape.value.points.findIndex((p) => p.id === selectedPointId.value))
const cornerName = computed(() => (cornerIndex.value < 0
  ? ''
  : cornerLabel(cornerIndex.value, activeShape.value.points[cornerIndex.value].name)))
const cornerDeg = computed(() => angles.value.find((a) => a.id === selectedPointId.value)?.deg ?? null)
function moveCorner(x: number, y: number) {
  if (selectedPoint.value) store.movePoint(selectedPoint.value.id, x, y)
}

/** Все стороны фигуры списком: подпись «АБ» и длина, которую диктуют. */
const sides = computed(() => {
  const pts = activeShape.value.points
  return activeEdges.value.map((e) => ({
    key: e.key,
    name: sideLabel(e.i1 - 1, e.i2 - 1, pts[e.i1 - 1]?.name, pts[e.i2 - 1]?.name),
    length: Math.round(e.length),
    arc: !!e.props.bulge,
  }))
})
const selectedEdge = computed(() => activeEdges.value.find((e) => e.key === selectedEdgeKey.value) ?? null)
const sideName = computed(() => sides.value.find((s) => s.key === selectedEdgeKey.value)?.name ?? '')
function setSide(key: string, value: string) {
  const mm = Number(value)
  if (mm > 0) store.setEdgeLength(key, mm)
}
const sagitta = computed(() => (selectedEdge.value
  ? Math.round(arcSagitta(selectedEdge.value.a, selectedEdge.value.b, selectedEdge.value.props.bulge))
  : 0))

/** Почему в итогах может стоять ноль — это надо сказать вслух, а не молчать. */
const openShapes = computed(() => shapes.value.filter((s) => !s.closed && s.points.length > 1).length)
const noCeiling = computed(() => shapeStats.value.length === 0)
/** Вырез вне полотна ничего не вычитает: сам не считается и площадь не даёт. */
const lostHole = computed(() => activeShape.value.kind === 'hole' && !hostOfActive.value)

/** Радиус скругления угла — его пишут в заказе как «R300». */
const cornerR = ref(300)
function roundCorner() {
  if (selectedPointId.value) store.roundCorner(selectedPointId.value, cornerR.value)
}

// ссылка на чертёж: данные едут в самом адресе, сервер не нужен
const shareState = ref('')
async function shareLink() {
  try {
    const url = await buildShareLink(JSON.parse(store.serialize()))
    await navigator.clipboard.writeText(url)
    shareState.value = t('panel.shareCopied', { n: url.length }, url.length)
  } catch {
    shareState.value = t('panel.shareFailed')
  }
  setTimeout(() => { shareState.value = '' }, 4000)
}

function exportJSON() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ceiling.json'
  a.click()
  URL.revokeObjectURL(url)
}
function importJSON(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  file.text().then((t) => store.importJSON(t))
}

const money = (v: number) => v.toFixed(0)
</script>

<template>
  <aside class="panel">
    <section>
      <h3>{{ t('panel.drawing') }}</h3>
      <div class="stat"><span>{{ t('panel.area') }}</span><b>{{ totals.areaM2.toFixed(2) }} {{ t('common.m2') }}</b></div>
      <div class="stat"><span>{{ t('panel.perimeter') }}</span><b>{{ totals.perimM.toFixed(2) }} {{ t('common.m') }}</b></div>
      <div class="stat total"><span>{{ t('panel.price') }}</span><b>{{ money(totals.price) }} {{ CURRENCY }}</b></div>
      <p v-if="noCeiling" class="warn">
        {{ t('panel.noCeilings') }}
      </p>
      <p v-else-if="openShapes" class="warn">{{ t('panel.openContours') }}</p>
    </section>

    <!-- стороны фигуры: подпись и длина, как в листе замера -->
    <section v-if="sides.length">
      <h3>{{ t('panel.sides') }}</h3>
      <ul class="sides">
        <li v-for="s in sides" :key="s.key" :class="{ on: s.key === selectedEdgeKey }">
          <button class="pick" @click="store.selectEdge(s.key)">{{ s.name }}</button>
          <input type="number" inputmode="decimal" min="1" step="10" :value="s.length"
            @focus="store.selectEdge(s.key)"
            @change="setSide(s.key, ($event.target as HTMLInputElement).value)" />
          <span class="unit">{{ t('common.mm') }}</span>
        </li>
      </ul>
    </section>

    <!-- угол: координаты и скругление числами -->
    <section v-if="selectedPoint">
      <h3>{{ t('panel.corner', { name: cornerName }) }}</h3>
      <div v-if="cornerDeg !== null" class="stat"><span>{{ t('panel.cornerSpread') }}</span><b>{{ cornerDeg }}°</b></div>
      <label class="row"><span>{{ t('panel.x') }}</span>
        <input type="number" inputmode="decimal" step="10" :value="selectedPoint.x"
          @change="moveCorner(Number(($event.target as HTMLInputElement).value), selectedPoint.y)" /></label>
      <label class="row"><span>{{ t('panel.y') }}</span>
        <input type="number" inputmode="decimal" step="10" :value="selectedPoint.y"
          @change="moveCorner(selectedPoint.x, Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="row"><span>{{ t('panel.roundR') }}</span>
        <input type="number" inputmode="decimal" min="10" step="10" v-model.number="cornerR" /></label>
      <div class="two">
        <button @click="roundCorner">{{ t('panel.round') }}</button>
        <button class="danger" @click="store.deleteSelected()">{{ t('panel.deleteCorner') }}</button>
      </div>
    </section>

    <!-- сторона: длина и прогиб дуги — то же, что диктуют на замере -->
    <section v-if="selectedEdge">
      <h3>{{ t('panel.side', { name: sideName }) }}</h3>
      <label class="row"><span>{{ t('panel.bulge') }}</span>
        <input type="number" inputmode="decimal" step="10" :value="sagitta"
          @change="store.setEdgeSagitta(selectedEdge.key, Number(($event.target as HTMLInputElement).value))" /></label>
      <div class="two">
        <button @click="store.insertOnEdge(selectedEdge.key)">{{ t('panel.split') }}</button>
        <button :disabled="!selectedEdge.props.bulge"
          @click="store.straightenEdge(selectedEdge.key)">{{ t('panel.straighten') }}</button>
      </div>
    </section>

    <section>
      <h3>{{ t('panel.selectedShape') }}</h3>
      <template v-if="!activeShape.closed">
        <p class="warn">{{ t('panel.openWarn') }}</p>
        <button :disabled="activeShape.points.length < 3" @click="store.toggleClosed()">
          {{ t('panel.closeContour') }}
        </button>
      </template>
      <template v-else>
        <div class="two seg">
          <button :class="{ on: activeShape.kind === 'ceiling' }"
            @click="store.setShapeKind(activeShape.id, 'ceiling')">{{ t('panel.ceiling') }}</button>
          <button :class="{ on: activeShape.kind === 'hole' }"
            :disabled="activeShape.kind !== 'hole' && !hostOfActive"
            :title="t('panel.holeOnlyInside')"
            @click="store.setShapeKind(activeShape.id, 'hole')">{{ t('panel.hole') }}</button>
        </div>
        <p v-if="lostHole" class="warn">
          {{ t('panel.holeOrphan') }}
        </p>
        <!-- у выреза нет ни цвета, ни своего яруса: он живёт настройками полотна, в котором лежит -->
        <template v-if="activeShape.kind === 'ceiling'">
          <div class="row"><span>{{ t('panel.colorAndFilm') }}</span>
            <button class="color-field" @click="emit('color')">
              <span class="color-sw" :style="{ background: activeShape.colorHex }"></span>
              <span class="color-nm">{{ activeShape.film }}</span>
            </button>
          </div>
          <label class="row"><span>{{ t('panel.level') }}</span>
            <input type="number" inputmode="numeric" min="1" step="1" :value="activeShape.level"
              @change="store.setShapeLevel(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
          <!-- ярус 1 — основной потолок; всё, что ниже, опускается на перепад -->
          <label v-if="activeShape.level > 1" class="row"><span>{{ t('panel.drop') }}</span>
            <input type="number" inputmode="decimal" min="0" step="10" :value="activeShape.drop"
              @change="store.setShapeDrop(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
          <div class="stat"><span>{{ t('panel.area') }}</span><b>{{ activeStats.areaM2.toFixed(2) }} {{ t('common.m2') }}</b></div>
          <div class="stat"><span>{{ t('panel.perimeter') }}</span><b>{{ activeStats.perimM.toFixed(2) }} {{ t('common.m') }}</b></div>
          <div class="stat total"><span>{{ t('panel.price') }}</span><b>{{ money(activeStats.price) }} {{ CURRENCY }}</b></div>
        </template>
      </template>
    </section>

    <!-- вид (на телефоне тумблеры живут здесь, а не в панели инструментов) -->
    <section v-if="showView" class="view">
      <h3>{{ t('panel.view') }}</h3>
      <div class="toggles">
        <button :class="{ on: settings.showGrid }"
          @click="store.updateSettings({ showGrid: !settings.showGrid })">
          <IconGrid :size="16" :stroke-width="1.75" />{{ t('toolbar.grid') }}</button>
        <button :class="{ on: settings.showMeasures }"
          @click="store.updateSettings({ showMeasures: !settings.showMeasures })">
          <IconDimensions :size="16" :stroke-width="1.75" />{{ t('toolbar.dims') }}</button>
        <button :class="{ on: settings.showTriangles }"
          @click="store.updateSettings({ showTriangles: !settings.showTriangles })">
          <IconTriangles :size="16" :stroke-width="1.75" />{{ t('toolbar.triangles') }}</button>
        <button :class="{ on: settings.snap }"
          @click="store.updateSettings({ snap: !settings.snap })">
          <IconSnap :size="16" :stroke-width="1.75" />{{ t('toolbar.snap') }}</button>
      </div>
      <div class="acts">
        <button :disabled="!past.length" @click="store.undo()">
          <IconUndo :size="16" :stroke-width="1.75" />{{ t('toolbar.undo') }}</button>
        <button :disabled="!future.length" @click="store.redo()">
          <IconRedo :size="16" :stroke-width="1.75" />{{ t('toolbar.redo') }}</button>
        <button @click="store.beginDraw()">
          <IconDraw :size="16" :stroke-width="1.75" />{{ t('panel.shape') }}</button>
        <button class="danger" @click="selectedPointId ? store.deleteSelected() : store.deleteActiveShape()">
          <IconDelete :size="16" :stroke-width="1.75" />{{ t('common.delete') }}</button>
      </div>
    </section>
    <section class="io">
      <button @click="shareLink">{{ t('panel.shareLink') }}</button>
      <p v-if="shareState" class="hint-small">{{ shareState }}</p>
      <button @click="exportJSON">{{ t('panel.exportJson') }}</button>
      <label class="import">{{ t('panel.importJson') }}
        <input type="file" accept="application/json" @change="importJSON" hidden />
      </label>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  width: 280px;
  flex: 0 0 280px;
  overflow-y: auto;
  background: var(--panel);
  border-left: 1px solid var(--border-soft);
  padding: 12px;
  color: var(--text);
}
section { margin-bottom: 18px; }
h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.stat { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
.stat b { color: var(--text-strong); }
.stat.total { border-top: 1px solid var(--border-soft); margin-top: 6px; padding-top: 8px; font-size: 15px; }
.stat.total b { color: var(--money); }
.warn {
  margin: 0 0 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; line-height: 1.45;
  background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text);
}
.sides { list-style: none; margin: 0; padding: 0; }
.sides li {
  display: flex; align-items: center; gap: 8px; padding: 3px 0;
}
.sides li.on .pick { background: var(--accent); border-color: var(--accent); color: #fff; }
.sides .pick {
  width: 52px; flex: 0 0 auto; margin: 0; padding: 8px 0; text-align: center;
  font-variant-numeric: tabular-nums; font-size: 13px;
}
.sides input { flex: 1 1 auto; min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
.sides .unit { flex: 0 0 auto; font-size: 12px; color: var(--muted-2); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.row input { width: 110px; }
input[type='number'] {
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 6px; padding: 6px 8px; font-size: 14px;
}
.color-field {
  display: flex; align-items: center; gap: 8px; width: 150px; margin: 0; padding: 6px 8px;
  background: var(--field); border: 1px solid var(--border); border-radius: 6px; color: var(--text-strong);
  font-size: 14px; text-align: left; cursor: pointer;
}
.color-field:hover { background: var(--accent-soft); border-color: var(--border-hover); }
.color-sw { width: 18px; height: 18px; flex: 0 0 auto; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.18); }
.color-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button {
  width: 100%; padding: 9px; margin-top: 6px; border-radius: 6px; cursor: pointer;
  background: var(--btn); color: var(--text); border: 1px solid var(--border); font-size: 14px;
}
button:hover:not(:disabled) { background: var(--btn-hover); }
button:disabled { opacity: 0.35; cursor: default; }
button.danger { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.view .toggles, .view .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.view .acts { margin-top: 6px; }
.view button {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  margin-top: 0; padding: 10px 8px; font-size: 13px;
}
.view button:disabled { opacity: 0.35; cursor: default; }
.view button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.hint-small { margin: 6px 0 0; font-size: 11px; color: var(--muted-2); line-height: 1.45; }
.io { display: flex; flex-direction: column; }
.import {
  display: block; text-align: center; padding: 9px; margin-top: 6px; border-radius: 6px;
  background: var(--btn); border: 1px solid var(--border); cursor: pointer; font-size: 14px;
}
</style>
