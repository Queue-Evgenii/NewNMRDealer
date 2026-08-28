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
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { CURRENCY } from '../pricing'
import { arcSagitta } from '../composables/useArcs'
import {
  IconGrid, IconDimensions, IconTriangles, IconSnap,
  IconUndo, IconRedo, IconDraw, IconDelete,
} from '../icons'

defineProps<{ showView?: boolean }>()
// окно цвета открывает рабочая область — см. ConstructorWorkspace
const emit = defineEmits<{ (e: 'color'): void }>()

const store = useConfigurator()
const {
  totals, activeStats, activeShape, shapes, shapeStats, hostOfActive,
  edges, selectedEdgeKey, settings, past, future, selectedPointId,
} = storeToRefs(store)

/** Выбранная сторона: у неё задают скругление — стрелку дуги от хорды. */
const selectedEdge = computed(() => edges.value.find((e) => e.key === selectedEdgeKey.value) ?? null)
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

const money = (v: number) => v.toFixed(0)
</script>

<template>
  <aside class="panel">
    <section>
      <h3>Чертёж</h3>
      <div class="stat"><span>Площадь</span><b>{{ totals.areaM2.toFixed(2) }} м²</b></div>
      <div class="stat"><span>Периметр</span><b>{{ totals.perimM.toFixed(2) }} м</b></div>
      <div class="stat total"><span>Цена</span><b>{{ money(totals.price) }} {{ CURRENCY }}</b></div>
      <p v-if="noCeiling" class="warn">
        Нет ни одного полотна: контуры не замкнуты или помечены вырезами.
      </p>
      <p v-else-if="openShapes" class="warn">Есть незамкнутые контуры — они в расчёт не идут.</p>
    </section>

    <!-- угол: скругление — самая частая правка контура -->
    <section v-if="selectedPointId">
      <h3>Угол</h3>
      <label class="row"><span>Радиус, мм</span>
        <input type="number" inputmode="decimal" min="10" step="10" v-model.number="cornerR" /></label>
      <button @click="roundCorner">Скруглить угол</button>
    </section>

    <!-- сторона: выгнуть дугой (арка, овал) -->
    <section v-if="selectedEdge">
      <h3>Сторона</h3>
      <label class="row"><span>Прогиб дуги, мм</span>
        <input type="number" inputmode="decimal" step="10" :value="sagitta"
          @change="store.setEdgeSagitta(selectedEdge.key, Number(($event.target as HTMLInputElement).value))" /></label>
      <div class="two">
        <button @click="store.insertOnEdge(selectedEdge.key)">Разделить</button>
        <button :disabled="!selectedEdge.props.bulge"
          @click="store.straightenEdge(selectedEdge.key)">Выпрямить</button>
      </div>
    </section>

    <section>
      <h3>Выбранное полотно</h3>
      <template v-if="!activeShape.closed">
        <p class="warn">Контур не замкнут — площадь и цена по нему не считаются.</p>
        <button :disabled="activeShape.points.length < 3" @click="store.toggleClosed()">
          Замкнуть контур
        </button>
      </template>
      <template v-else>
        <div class="two seg">
          <button :class="{ on: activeShape.kind === 'ceiling' }"
            @click="store.setShapeKind(activeShape.id, 'ceiling')">Полотно</button>
          <button :class="{ on: activeShape.kind === 'hole' }"
            :disabled="activeShape.kind !== 'hole' && !hostOfActive"
            title="Вырез возможен только внутри другого полотна"
            @click="store.setShapeKind(activeShape.id, 'hole')">Вырез</button>
        </div>
        <p v-if="lostHole" class="warn">
          Этот вырез не лежит внутри полотна — он ничего не вычитает и в расчёт не идёт.
          Верните «Полотно».
        </p>
        <!-- у выреза нет ни цвета, ни своего яруса: он живёт настройками полотна, в котором лежит -->
        <template v-if="activeShape.kind === 'ceiling'">
          <div class="row"><span>Цвет и плёнка</span>
            <button class="color-field" @click="emit('color')">
              <span class="color-sw" :style="{ background: activeShape.colorHex }"></span>
              <span class="color-nm">{{ activeShape.film }}</span>
            </button>
          </div>
          <label class="row"><span>Ярус</span>
            <input type="number" inputmode="numeric" min="1" step="1" :value="activeShape.level"
              @change="store.setShapeLevel(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
          <!-- ярус 1 — основной потолок; всё, что ниже, опускается на перепад -->
          <label v-if="activeShape.level > 1" class="row"><span>Перепад вниз, мм</span>
            <input type="number" inputmode="decimal" min="0" step="10" :value="activeShape.drop"
              @change="store.setShapeDrop(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
          <div class="stat"><span>Площадь</span><b>{{ activeStats.areaM2.toFixed(2) }} м²</b></div>
          <div class="stat"><span>Периметр</span><b>{{ activeStats.perimM.toFixed(2) }} м</b></div>
          <div class="stat total"><span>Цена</span><b>{{ money(activeStats.price) }} {{ CURRENCY }}</b></div>
        </template>
      </template>
    </section>

    <!-- вид (на телефоне тумблеры живут здесь, а не в панели инструментов) -->
    <section v-if="showView" class="view">
      <h3>Вид</h3>
      <div class="toggles">
        <button :class="{ on: settings.showGrid }"
          @click="store.updateSettings({ showGrid: !settings.showGrid })">
          <IconGrid :size="16" :stroke-width="1.75" />Сетка</button>
        <button :class="{ on: settings.showMeasures }"
          @click="store.updateSettings({ showMeasures: !settings.showMeasures })">
          <IconDimensions :size="16" :stroke-width="1.75" />Размеры</button>
        <button :class="{ on: settings.showTriangles }"
          @click="store.updateSettings({ showTriangles: !settings.showTriangles })">
          <IconTriangles :size="16" :stroke-width="1.75" />Треуг.</button>
        <button :class="{ on: settings.snap }"
          @click="store.updateSettings({ snap: !settings.snap })">
          <IconSnap :size="16" :stroke-width="1.75" />Привязка</button>
      </div>
      <div class="acts">
        <button :disabled="!past.length" @click="store.undo()">
          <IconUndo :size="16" :stroke-width="1.75" />Отмена</button>
        <button :disabled="!future.length" @click="store.redo()">
          <IconRedo :size="16" :stroke-width="1.75" />Повтор</button>
        <button @click="store.beginDraw()">
          <IconDraw :size="16" :stroke-width="1.75" />Фигура</button>
        <button class="danger" @click="selectedPointId ? store.deleteSelected() : store.deleteActiveShape()">
          <IconDelete :size="16" :stroke-width="1.75" />Удалить</button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  width: 280px;
  flex: 0 0 280px;
  overflow-y: auto;
  background: #10182a;
  border-left: 1px solid #223;
  padding: 12px;
  color: #cbd5e1;
}
section { margin-bottom: 18px; }
h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa3c4; }
.stat { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
.stat b { color: #e8eefc; }
.stat.total { border-top: 1px solid #223; margin-top: 6px; padding-top: 8px; font-size: 15px; }
.stat.total b { color: #4fd08a; }
.warn {
  margin: 0 0 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; line-height: 1.45;
  background: #2a2214; border: 1px solid #4a3a1c; color: #ffce7a;
}
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.row input { width: 110px; }
input[type='number'] {
  background: #0d1320; border: 1px solid #2a3550; color: #e8eefc;
  border-radius: 6px; padding: 6px 8px; font-size: 14px;
}
.color-field {
  display: flex; align-items: center; gap: 8px; width: 150px; margin: 0; padding: 6px 8px;
  background: #0d1320; border: 1px solid #2a3550; border-radius: 6px; color: #e8eefc;
  font-size: 14px; text-align: left; cursor: pointer;
}
.color-field:hover { background: #16203a; border-color: #3a4a72; }
.color-sw { width: 18px; height: 18px; flex: 0 0 auto; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.18); }
.color-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button {
  width: 100%; padding: 9px; margin-top: 6px; border-radius: 6px; cursor: pointer;
  background: #1b2436; color: #cbd5e1; border: 1px solid #2a3550; font-size: 14px;
}
button:hover:not(:disabled) { background: #24314b; }
button:disabled { opacity: 0.35; cursor: default; }
button.danger { background: #3a1b22; border-color: #5a2530; color: #ff9b9b; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.seg button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.view .toggles, .view .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.view .acts { margin-top: 6px; }
.view button {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  margin-top: 0; padding: 10px 8px; font-size: 13px;
}
.view button:disabled { opacity: 0.35; cursor: default; }
.view button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
</style>
