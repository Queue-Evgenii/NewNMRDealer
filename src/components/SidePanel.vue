<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { filmColor } from '../filmColors'
import { arcSagitta, arcRadius } from '../composables/useArcs'
import { buildShareLink } from '../composables/useShareLink'
import {
  IconGrid, IconDimensions, IconTriangles, IconSnap,
  IconUndo, IconRedo, IconDraw, IconDelete, IconClose,
  IconShow, IconHide, IconIsolate, IconPlus,
} from '../icons'

defineProps<{ showView?: boolean }>()

const store = useConfigurator()
const {
  allPoints, edges, area, perimeterMm, diagonalList, garpunLength, seamLength,
  selectedPoint, selectedPointId, selectedEdgeKey, settings, cutAreaM2, shapesView, activeShape,
  order, pricing, cost, past, future, holeArea, levelStats,
} = storeToRefs(store)

const cur = computed(() => order.value.currency)
function money(v: number) { return v.toFixed(2) }
function removeShape(id: string) { store.setActiveShape(id); store.deleteActiveShape() }

const areaM2 = computed(() => (area.value / 1_000_000).toFixed(3))
const perimM = computed(() => (perimeterMm.value / 1000).toFixed(3))
const garpunM = computed(() => (garpunLength.value / 1000).toFixed(2))
const seamM = computed(() => (seamLength.value / 1000).toFixed(2))
const cutArea = computed(() => cutAreaM2.value.toFixed(3))

const selectedEdge = computed(() =>
  edges.value.find((e) => e.key === selectedEdgeKey.value) ?? null,
)

// скругление выбранной стороны: на объекте мерят хорду и стрелку
const arcSag = computed(() =>
  selectedEdge.value ? Math.round(arcSagitta(selectedEdge.value.a, selectedEdge.value.b, selectedEdge.value.props.bulge)) : 0)
const arcRad = computed(() =>
  selectedEdge.value ? Math.round(arcRadius(selectedEdge.value.a, selectedEdge.value.b, selectedEdge.value.props.bulge)) : 0)
function editSagitta(v: string) {
  if (selectedEdge.value) store.setEdgeSagitta(selectedEdge.value.key, Number(v))
}
function editRadius(v: string) {
  if (selectedEdge.value) store.setEdgeRadius(selectedEdge.value.key, Number(v))
}

function editX(v: string) {
  if (selectedPoint.value) store.movePoint(selectedPoint.value.id, Number(v), selectedPoint.value.y)
}
function editY(v: string) {
  if (selectedPoint.value) store.movePoint(selectedPoint.value.id, selectedPoint.value.x, Number(v))
}
function editLen(v: string) {
  if (selectedEdge.value) store.setEdgeLength(selectedEdge.value.key, Number(v))
}

// слои = ярусы: показываем потолок по одному слою, чтобы разобраться в нём
const levelsShown = computed(() => levelStats.value.filter((l) => l.visible).length)
function stepLevels(d: number) {
  const n = Math.max(1, Math.min(levelStats.value.length, levelsShown.value + d))
  store.showUpToLevel(n)
}

// ссылка на чертёж: данные едут в самом адресе, сервер не нужен
const shareState = ref('')
async function shareLink() {
  try {
    const url = await buildShareLink(JSON.parse(store.serialize()))
    await navigator.clipboard.writeText(url)
    shareState.value = `Ссылка скопирована · ${url.length} символов`
  } catch {
    shareState.value = 'Не удалось скопировать — проверьте доступ к буферу обмена'
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
</script>

<template>
  <aside class="panel">
    <!-- что выделено — всегда первым: на телефоне это верх шторки -->
    <!-- выделенный угол -->
    <section v-if="selectedPoint">
      <h3>Точка</h3>
      <label class="row"><span>X, мм</span>
        <input type="number" inputmode="decimal" :value="selectedPoint.x" @change="editX(($event.target as HTMLInputElement).value)" /></label>
      <label class="row"><span>Y, мм</span>
        <input type="number" inputmode="decimal" :value="selectedPoint.y" @change="editY(($event.target as HTMLInputElement).value)" /></label>
      <button class="danger" @click="store.deleteSelected()">Удалить точку</button>
    </section>
    <!-- выделенная сторона -->
    <section v-if="selectedEdge">
      <h3>Сторона</h3>
      <label class="row"><span>Длина, мм</span>
        <input type="number" inputmode="decimal" :value="Math.round(selectedEdge.length)"
          @change="editLen(($event.target as HTMLInputElement).value)" /></label>
      <label class="check">
        <input type="checkbox" :checked="selectedEdge.props.garpun"
          @change="store.setEdgeProp(selectedEdge.key, 'garpun', ($event.target as HTMLInputElement).checked)" />
        Гарпун по стороне
      </label>
      <label class="check">
        <input type="checkbox" :checked="selectedEdge.props.seam"
          @change="store.setEdgeProp(selectedEdge.key, 'seam', ($event.target as HTMLInputElement).checked)" />
        Шов / спайка
      </label>

      <h3 class="sub">Скругление</h3>
      <label class="row"><span>Стрелка, мм</span>
        <input type="number" inputmode="decimal" min="0" :value="arcSag"
          @change="editSagitta(($event.target as HTMLInputElement).value)" /></label>
      <label class="row"><span>Радиус, мм</span>
        <input type="number" inputmode="decimal" min="0" :value="arcRad"
          @change="editRadius(($event.target as HTMLInputElement).value)" /></label>
      <p class="hint-small">Стрелка — расстояние от середины хорды до стены. Хорда {{ Math.round(selectedEdge.chord) }} мм.</p>
      <div v-if="selectedEdge.props.bulge" class="two">
        <button @click="store.flipEdgeArc(selectedEdge.key)">В другую сторону</button>
        <button @click="store.straightenEdge(selectedEdge.key)">Выпрямить</button>
      </div>
    </section>

    <!-- слои: ярусы можно показывать по одному -->
    <section v-if="levelStats.length">
      <h3>Слои (ярусы)</h3>
      <div v-if="levelStats.length > 1" class="stepper">
        <button :disabled="levelsShown <= 1" title="Показать на слой меньше"
          @click="stepLevels(-1)">−</button>
        <span>Показано {{ levelsShown }} из {{ levelStats.length }}</span>
        <button :disabled="levelsShown >= levelStats.length" title="Показать следующий слой"
          @click="stepLevels(1)">＋</button>
      </div>
      <ul class="levels">
        <li v-for="l in levelStats" :key="l.level" :class="{ off: !l.visible }">
          <button class="eye" :title="l.visible ? 'Скрыть ярус' : 'Показать ярус'"
            @click="store.toggleLevelVisible(l.level)">
            <component :is="l.visible ? IconShow : IconHide" :size="15" :stroke-width="1.75" />
          </button>
          <span class="no">Ярус {{ l.level }}</span>
          <span class="muted">{{ l.drop ? '−' + l.drop + ' мм' : 'базовый' }}</span>
          <span class="val">{{ l.areaM2.toFixed(2) }} м²</span>
          <button class="eye" title="Показать только этот ярус" @click="store.isolateLevel(l.level)">
            <IconIsolate :size="14" :stroke-width="1.75" />
          </button>
        </li>
      </ul>
      <div class="two">
        <button @click="store.addLevel()"><IconPlus :size="15" :stroke-width="2" />Добавить ярус</button>
        <button :disabled="!levelStats.some((l) => !l.visible)" @click="store.showAllLevels()">
          Показать все
        </button>
      </div>
      <p class="hint-small">
        Каждый ярус — отдельное полотно со своим профилем. Скрытые ярусы не мешают чертежу
        и не ловят нажатия.
      </p>
    </section>

    <!-- активная фигура: полотно или вырез, ярус, перепад -->
    <section v-if="activeShape.closed">
      <h3>Фигура</h3>
      <div class="two seg">
        <button :class="{ on: activeShape.kind === 'ceiling' }"
          @click="store.setShapeKind(activeShape.id, 'ceiling')">Полотно</button>
        <button :class="{ on: activeShape.kind === 'hole' }"
          @click="store.setShapeKind(activeShape.id, 'hole')">Вырез</button>
      </div>
      <p v-if="activeShape.kind === 'hole'" class="hint-small">
        Вырез вычитается из полотна, внутри которого нарисован: колонна, короб, проём под нижний ярус.
      </p>
      <label class="row"><span>Ярус</span>
        <input type="number" inputmode="numeric" min="1" step="1" :value="activeShape.level"
          @change="store.setShapeLevel(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="row"><span>Перепад вниз, мм</span>
        <input type="number" inputmode="decimal" min="0" step="10" :value="activeShape.drop"
          @change="store.setShapeDrop(activeShape.id, Number(($event.target as HTMLInputElement).value))" /></label>
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

    <!-- order -->
    <section>
      <h3>Заказ</h3>
      <label class="row"><span>Клиент</span>
        <input type="text" :value="order.client" placeholder="—"
          @input="store.updateOrder({ client: ($event.target as HTMLInputElement).value })" /></label>
      <label class="row"><span>Полотно</span>
        <div class="film-field">
          <span class="film-dot" :style="{ background: filmColor(order.film) }"></span>
          <select :value="order.film"
            @change="store.updateOrder({ film: ($event.target as HTMLSelectElement).value })">
            <option>Глянец</option><option>Мат</option><option>Сатин</option><option>Фактура</option>
          </select>
        </div></label>
      <label class="row"><span>Цвет</span>
        <input type="text" :value="order.color"
          @input="store.updateOrder({ color: ($event.target as HTMLInputElement).value })" /></label>
    </section>

    <!-- calculations -->
    <section>
      <h3>Расчёт</h3>
      <div class="stat"><span>Площадь S</span><b>{{ areaM2 }} м²</b></div>
      <div class="stat"><span>Периметр P</span><b>{{ perimM }} м</b></div>
      <div class="stat"><span>Гарпун</span><b>{{ garpunM }} м</b></div>
      <div class="stat"><span>Швы (спайка)</span><b>{{ seamM }} м</b></div>
      <div v-if="holeArea > 0" class="stat"><span>Вырезы</span><b>−{{ (holeArea / 1e6).toFixed(3) }} м²</b></div>
      <div class="stat"><span>Углов</span><b>{{ allPoints.length }}</b></div>
      <div class="stat"><span>Фигур</span><b>{{ shapesView.length }}</b></div>
      <div class="stat hl"><span>Раскрой (усадка {{ settings.usad }}%)</span><b>{{ cutArea }} м²</b></div>
    </section>

    <!-- shrink control -->
    <section>
      <h3>Усадка полотна</h3>
      <label class="row">
        <span>Коэф. усадки, %</span>
        <input type="number" inputmode="decimal" step="0.5" :value="settings.usad"
          @input="store.updateSettings({ usad: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="row">
        <span>Шаг сетки, мм</span>
        <input type="number" inputmode="decimal" step="10" :value="settings.gridStep"
          @input="store.updateSettings({ gridStep: Number(($event.target as HTMLInputElement).value) })" />
      </label>
    </section>

    <!-- cost -->
    <section class="cost">
      <h3>Стоимость</h3>
      <div class="rates">
        <label>Полотно, {{ cur }}/м²
          <input type="number" inputmode="decimal" :value="pricing.filmPerM2"
            @input="store.updatePricing({ filmPerM2: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>Гарпун, {{ cur }}/м
          <input type="number" inputmode="decimal" :value="pricing.garpunPerM"
            @input="store.updatePricing({ garpunPerM: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>Спайка, {{ cur }}/м
          <input type="number" inputmode="decimal" :value="pricing.seamPerM"
            @input="store.updatePricing({ seamPerM: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>Монтаж, {{ cur }}/м²
          <input type="number" inputmode="decimal" :value="pricing.workPerM2"
            @input="store.updatePricing({ workPerM2: Number(($event.target as HTMLInputElement).value) })" /></label>
      </div>
      <div class="stat"><span>Полотно</span><b>{{ money(cost.film) }}</b></div>
      <div class="stat"><span>Гарпун</span><b>{{ money(cost.garpun) }}</b></div>
      <div class="stat"><span>Спайка</span><b>{{ money(cost.seam) }}</b></div>
      <div class="stat"><span>Монтаж</span><b>{{ money(cost.work) }}</b></div>
      <div class="stat total"><span>Итого</span><b>{{ money(cost.total) }} {{ cur }}</b></div>
    </section>



    <!-- shapes -->
    <section>
      <h3>Фигуры</h3>
      <ul class="shapes">
        <li v-for="(s, i) in shapesView" :key="s.id"
          :class="{ sel: s.active }" @click="store.setActiveShape(s.id)">
          <span>{{ s.kind === 'hole' ? 'Вырез' : 'Фигура' }} {{ i + 1 }}</span>
          <span class="muted">
            {{ s.points.length }} т.<template v-if="s.level > 1"> · ярус {{ s.level }}</template>
            <template v-if="!s.closed"> · открыт</template>
          </span>
          <button v-if="shapesView.length > 1" class="x" title="Удалить фигуру"
            @click.stop="removeShape(s.id)"><IconClose :size="14" :stroke-width="2" /></button>
        </li>
      </ul>
      <button class="add-shape" @click="store.beginDraw()">
        <IconDraw :size="15" :stroke-width="1.75" />Нарисовать новую фигуру
      </button>
    </section>

    <!-- vertices list -->
    <section>
      <h3>Углы активной фигуры ({{ activeShape.points.length }})</h3>
      <ul class="dots">
        <li v-for="(p, i) in activeShape.points" :key="p.id"
          :class="{ sel: selectedPointId === p.id }" @click="store.selectPoint(p.id)">
          <span>т.{{ i + 1 }}</span><span>{{ p.x }}, {{ p.y }}</span>
        </li>
      </ul>
    </section>

    <!-- diagonals -->
    <section v-if="diagonalList.length">
      <h3>Диагонали</h3>
      <ul class="diag">
        <li v-for="(d, i) in diagonalList" :key="i">{{ Math.round(d.length) }} мм</li>
      </ul>
    </section>

    <section class="io">
      <button @click="shareLink">Ссылка на чертёж</button>
      <p v-if="shareState" class="hint-small">{{ shareState }}</p>
      <button @click="exportJSON">Экспорт JSON</button>
      <label class="import">Импорт JSON
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
  background: #10182a;
  border-left: 1px solid #223;
  padding: 12px;
  color: #cbd5e1;
}
section { margin-bottom: 18px; }
h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa3c4; }
.stat { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
.stat b { color: #e8eefc; }
.stat.hl { border-top: 1px solid #223; margin-top: 4px; padding-top: 8px; }
.stat.hl b { color: #ffb454; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.row input { width: 110px; }
input[type='number'], input[type='text'], select {
  background: #0d1320; border: 1px solid #2a3550; color: #e8eefc;
  border-radius: 6px; padding: 6px 8px; font-size: 14px;
}
.row input[type='text'], .row select { width: 150px; }
.rates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.rates label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #8fa3c4; }
.rates input { width: 100%; }
.film-field { display: flex; align-items: center; gap: 8px; width: 150px; }
.film-field select { flex: 1; }
.film-dot { width: 14px; height: 14px; border-radius: 4px; border: 1px solid #0006; flex: 0 0 auto; }
.stat.total { border-top: 1px solid #223; margin-top: 6px; padding-top: 8px; font-size: 15px; }
.stat.total b { color: #4fd08a; }
.check { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; cursor: pointer; }
.shapes { list-style: none; margin: 0 0 8px; padding: 0; }
.shapes li { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.shapes li:hover { background: #172136; }
.shapes li.sel { background: #16274a; }
.shapes .muted { color: #7f90b0; margin-left: auto; font-size: 12px; }
.shapes .x { display: flex; align-items: center; background: none; border: none; color: #ff8b8b; cursor: pointer; width: auto; padding: 0 4px; margin: 0; }
.add-shape {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 9px; border-radius: 6px; cursor: pointer;
  background: #16233f; color: #9fc0ff; border: 1px dashed #2f6fed; font-size: 13px;
}
.dots, .diag { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; }
.dots li { display: flex; justify-content: space-between; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 13px; }
.dots li:hover { background: #172136; }
.dots li.sel { background: #2f6fed; color: #fff; }
.diag li { padding: 3px 8px; font-size: 13px; }
button {
  width: 100%; padding: 9px; margin-top: 6px; border-radius: 6px; cursor: pointer;
  background: #1b2436; color: #cbd5e1; border: 1px solid #2a3550; font-size: 14px;
}
button:hover { background: #24314b; }
button.danger { background: #3a1b22; border-color: #5a2530; color: #ff9b9b; }
.sub { margin-top: 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.two button { margin-top: 6px; }
.seg button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.hint-small { margin: 6px 0 0; font-size: 11px; color: #7f90b0; line-height: 1.45; }
.levels { list-style: none; margin: 0; padding: 0; }
.levels li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px; font-size: 13px; }
.levels li.off { opacity: 0.45; }
.levels .eye {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; margin: 0; flex: 0 0 auto;
  background: none; border: none; color: #8fa3c4; cursor: pointer; border-radius: 5px;
}
.levels .eye:hover { background: #24314b; color: #dbe6ff; }
.stepper { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #8fa3c4; }
.stepper button {
  width: 28px; height: 28px; padding: 0; margin: 0; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
}
.stepper span { flex: 1; text-align: center; }
.levels li:nth-child(odd) { background: #141d31; }
.levels .no { color: #7fd6ff; }
.levels .val { margin-left: auto; font-variant-numeric: tabular-nums; }
.view .toggles, .view .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.view .acts { margin-top: 6px; }
.view button {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  margin-top: 0; padding: 10px 8px; font-size: 13px;
}
.view button:disabled { opacity: 0.35; cursor: default; }
.view button.on { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.io { display: flex; flex-direction: column; }
.import {
  display: block; text-align: center; padding: 9px; margin-top: 6px; border-radius: 6px;
  background: #1b2436; border: 1px solid #2a3550; cursor: pointer; font-size: 14px;
}
</style>
