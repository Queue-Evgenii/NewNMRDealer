<script setup lang="ts">
// Панель «метод треугольников»: замерщик диктует длины — контур строится сам.
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'

const store = useConfigurator()
const { activeShape, activeEdges, measureBaseKey, measureRows, triangleAreaM2, activeAreaM2,
  activeChordAreaM2, arcRows, triPreview, triangleQuality, meshStale, activeHoleCount } = storeToRefs(store)

const hasTriangles = computed(() => activeShape.value.triangles.length > 0)
const triCount = computed(() => activeShape.value.triangles.length)

// ---- первый треугольник --------------------------------------------------
const base0 = ref<number | null>(null)
const sideA0 = ref<number | null>(null)
const sideB0 = ref<number | null>(null)
const err0 = ref('')

function buildFirst() {
  err0.value = store.startTriangleShape(Number(base0.value), Number(sideA0.value), Number(sideB0.value)) ?? ''
  if (!err0.value) { base0.value = null; sideA0.value = null; sideB0.value = null }
}

function splitCurrent() {
  err0.value = store.triangulateActive() ?? ''
}
function resplit() {
  store.clearTriangles()
  err0.value = store.triangulateActive() ?? ''
}

// ---- следующий треугольник ----------------------------------------------
const lenA = ref<number | null>(null)
const lenB = ref<number | null>(null)
const errN = ref('')

const base = computed(() => activeEdges.value.find((e) => e.key === measureBaseKey.value) ?? null)
const dirty = computed(() => activeShape.value.measureDirty)

watch([base, lenA, lenB], () => {
  errN.value = ''
  store.previewTriangle(base.value?.key ?? null, Number(lenA.value), Number(lenB.value))
})
onBeforeUnmount(() => store.clearPreview())

const previewMsg = computed(() => (triPreview.value && !triPreview.value.ok ? triPreview.value.msg : ''))
const previewWarn = computed(() =>
  (triPreview.value?.ok && triPreview.value.level !== 'good' ? triPreview.value.msg : ''))
const previewHint = computed(() =>
  (triPreview.value?.ok && triPreview.value.level === 'good' ? triPreview.value.msg : ''))

/** Треугольники, по которым замер ненадёжен: слишком узкая засечка. */
const weak = computed(() => triangleQuality.value.filter((q) => q.level !== 'good'))

function addNext() {
  if (!base.value) { errN.value = 'Выберите сторону-основание на чертеже'; return }
  errN.value = store.attachTriangle(base.value.key, Number(lenA.value), Number(lenB.value)) ?? ''
  if (!errN.value) { lenA.value = null; lenB.value = null }
}

// ---- сводка по треугольникам --------------------------------------------
const triList = computed(() => {
  const byNo = new Map<number, { no: number; sides: string[]; area: number }>()
  for (const r of measureRows.value) {
    const t = byNo.get(r.no) ?? { no: r.no, sides: [], area: r.area }
    t.sides.push(`${r.len}${r.kind === 'Диагональ' ? '*' : ''}`)
    byNo.set(r.no, t)
  }
  return [...byNo.values()].map((t) => ({
    ...t,
    q: triangleQuality.value.find((q) => q.no === t.no) ?? null,
  }))
})

const areaM2 = computed(() => activeAreaM2.value.toFixed(3))
const triAreaM2 = computed(() => triangleAreaM2.value.toFixed(3))
// треугольники кроют многоугольник по хордам, скругления считаются отдельно
const areaMatches = computed(() => Math.abs(triangleAreaM2.value - activeChordAreaM2.value) < 0.001)
const arcExtra = computed(() => activeAreaM2.value - activeChordAreaM2.value)

function csv(): string {
  const lines = ['№ треугольника;Сторона;Длина, мм;Тип']
  lines.push(...measureRows.value.map((r) => `${r.no};${r.side};${r.len};${r.kind}`))
  if (arcRows.value.length) {
    lines.push('', 'Скругления;Сторона;Хорда, мм;Стрелка, мм;Радиус, мм;Длина дуги, мм')
    lines.push(...arcRows.value.map((r) => `;${r.side};${r.chord};${r.sagitta};${r.radius};${r.length}`))
  }
  return lines.join('\r\n')
}
function exportCsv() {
  const blob = new Blob(['﻿' + csv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'zamer-triangles.csv'
  a.click()
  URL.revokeObjectURL(url)
}
function copyCsv() {
  navigator.clipboard?.writeText(csv())
}
</script>

<template>
  <aside class="panel">
    <section class="intro">
      <h3>Метод треугольников</h3>
      <p>
        Углы на объекте не меряют — только длины. Комната разбивается на треугольники:
        стороны + диагонали. По трём сторонам треугольник строится однозначно, поэтому
        контур собирается сам. Треугольники не пересекаются — это проверяется при каждой
        пристройке.
      </p>
    </section>

    <!-- первый треугольник -->
    <section v-if="!hasTriangles">
      <h3>Первый треугольник</h3>
      <label class="row"><span>Основание (1–2)</span>
        <input type="number" inputmode="decimal" min="1" placeholder="мм" v-model.number="base0" /></label>
      <label class="row"><span>Сторона от т.1</span>
        <input type="number" inputmode="decimal" min="1" placeholder="мм" v-model.number="sideA0" /></label>
      <label class="row"><span>Сторона от т.2</span>
        <input type="number" inputmode="decimal" min="1" placeholder="мм" v-model.number="sideB0" /></label>
      <button class="primary" @click="buildFirst">Построить треугольник</button>
      <div class="or">или</div>
      <button @click="splitCurrent">Разбить текущую фигуру на треугольники</button>
      <p v-if="err0" class="err">{{ err0 }}</p>
    </section>

    <!-- следующий треугольник -->
    <section v-else>
      <h3>Следующий треугольник</h3>
      <div class="base">
        <template v-if="base">
          <span>Основание</span>
          <b>сторона {{ base.i1 }}–{{ base.i2 }}</b>
          <span class="muted">{{ Math.round(base.length) }} мм</span>
        </template>
        <span v-else class="muted">Тап по стороне на чертеже — или выберите ниже</span>
      </div>
      <select class="pick" :value="measureBaseKey ?? ''"
        @change="store.setMeasureBase(($event.target as HTMLSelectElement).value || null)">
        <option value="">— сторона-основание —</option>
        <option v-for="e in activeEdges" :key="e.key" :value="e.key">
          {{ e.i1 }}–{{ e.i2 }} · {{ Math.round(e.length) }} мм
        </option>
      </select>
      <label class="row"><span>От точки {{ base?.i1 ?? '1' }}</span>
        <input type="number" inputmode="decimal" min="1" placeholder="мм" v-model.number="lenA" /></label>
      <label class="row"><span>От точки {{ base?.i2 ?? '2' }}</span>
        <input type="number" inputmode="decimal" min="1" placeholder="мм" v-model.number="lenB" /></label>
      <button class="primary" :disabled="!base" @click="addNext">Пристроить треугольник</button>
      <p v-if="errN" class="err">{{ errN }}</p>
      <p v-else-if="previewMsg" class="err">{{ previewMsg }}</p>
      <p v-else-if="previewWarn" class="warn">{{ previewWarn }}</p>
      <p v-else-if="previewHint" class="ok">{{ previewHint }}</p>
    </section>

    <!-- разбивка не знает про вырез -->
    <section v-if="meshStale" class="warn-box">
      <p>
        Разбивка построена до того, как контур изменился: вырезы и вложенные фигуры в неё
        не вошли, треугольники идут сквозь них. Сумма треугольников не сойдётся с площадью.
      </p>
      <button class="primary" @click="resplit">Разбить заново</button>
      <p v-if="err0" class="err">{{ err0 }}</p>
    </section>

    <!-- размеры правили руками -->
    <section v-if="dirty" class="warn-box">
      <p>Геометрию двигали вручную — длины ниже больше не те, что диктовал замерщик.</p>
      <button @click="store.triangulateActive()">Пересчитать разбивку по чертежу</button>
    </section>

    <!-- список треугольников -->
    <section v-if="hasTriangles">
      <h3>Треугольники ({{ triCount }})</h3>
      <ul class="tris">
        <li v-for="t in triList" :key="t.no" :class="t.q?.level">
          <span class="no">△{{ t.no }}</span>
          <span class="sides">{{ t.sides.join(' · ') }}</span>
          <span v-if="t.q" class="angle" :title="'Ошибка рулетки множится ×' + t.q.factor.toFixed(1)">
            {{ t.q.minAngle }}°
          </span>
          <span class="muted">{{ (t.area / 1_000_000).toFixed(2) }} м²</span>
        </li>
      </ul>
      <p class="legend">* — диагональ · градусы — самый острый угол треугольника</p>
      <div class="stat"><span>Вырезов в фигуре</span>
        <b :class="{ warn: activeHoleCount === 0 }">{{ activeHoleCount }}</b></div>
      <p v-if="activeHoleCount" class="legend">Их углы входят в разбивку — треугольники обходят вырез.</p>
      <p v-if="weak.length" class="warn">
        Узкие треугольники: {{ weak.map((w) => '△' + w.no).join(', ') }}. В них ошибка рулетки
        бьёт по вершине до ×{{ Math.max(...weak.map((w) => w.factor)).toFixed(1) }} —
        такие места лучше перемерить, взяв основанием другую сторону.
      </p>
      <div class="stat"><span>Сумма треугольников</span><b>{{ triAreaM2 }} м²</b></div>
      <div class="stat"><span>Площадь по хордам</span>
        <b :class="{ warn: !areaMatches }">{{ activeChordAreaM2.toFixed(3) }} м²</b></div>
      <div v-if="Math.abs(arcExtra) > 0.0005" class="stat">
        <span>Скругления</span><b>{{ arcExtra > 0 ? '+' : '' }}{{ arcExtra.toFixed(3) }} м²</b></div>
      <div v-if="Math.abs(arcExtra) > 0.0005" class="stat"><span>Итого фигура</span><b>{{ areaM2 }} м²</b></div>
      <button @click="resplit">Разбить заново по чертежу</button>
      <p v-if="err0 && !meshStale" class="err">{{ err0 }}</p>
      <button @click="store.removeLastTriangle()">Убрать последний</button>
      <button class="danger" @click="store.clearTriangles()">Сбросить разбивку</button>
    </section>

    <!-- скругления -->
    <section v-if="arcRows.length">
      <h3>Скругления ({{ arcRows.length }})</h3>
      <table class="measure">
        <thead><tr><th>Сторона</th><th>Хорда</th><th>Стрелка</th><th>R</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in arcRows" :key="i">
            <td>{{ r.side }}</td><td>{{ r.chord }}</td><td>{{ r.sagitta }}</td><td>{{ r.radius }}</td>
          </tr>
        </tbody>
      </table>
      <p class="legend">Дугу мерят хордой и стрелкой — от середины хорды до стены.</p>
    </section>

    <!-- таблица замера -->
    <section v-if="measureRows.length">
      <h3>Лист замера</h3>
      <table class="measure">
        <thead><tr><th>△</th><th>Сторона</th><th>мм</th><th>Тип</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in measureRows" :key="i" :class="{ diag: r.kind === 'Диагональ' }">
            <td>{{ r.no }}</td><td>{{ r.side }}</td><td>{{ r.len }}</td>
            <td>{{ r.kind === 'Диагональ' ? 'диаг.' : 'контур' }}</td>
          </tr>
        </tbody>
      </table>
      <button @click="exportCsv">Экспорт замера (CSV)</button>
      <button @click="copyCsv">Копировать в буфер</button>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  width: 300px; flex: 0 0 300px; overflow-y: auto;
  background: var(--panel); border-left: 1px solid var(--border-soft); padding: 12px; color: var(--text);
}
section { margin-bottom: 18px; }
h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.intro p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.row input { width: 110px; }
input[type='number'], select {
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 6px; padding: 6px 8px; font-size: 14px;
}
.pick { width: 100%; margin-bottom: 10px; }
.base { display: flex; align-items: baseline; gap: 6px; font-size: 13px; margin-bottom: 8px; flex-wrap: wrap; }
.base b { color: #ffd54a; }
.muted { color: var(--muted-2); font-size: 12px; }
.or { text-align: center; font-size: 11px; color: var(--muted-3); margin: 8px 0 2px; }
.err { margin: 8px 0 0; font-size: 12px; color: var(--danger-text); line-height: 1.4; }
.warn-box { background: var(--warn-bg); border: 1px solid var(--warn-border); border-radius: 8px; padding: 10px 12px; }
.warn-box p { margin: 0; font-size: 12px; color: var(--warn-text); line-height: 1.45; }
.warn-box button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.ok { margin: 8px 0 0; font-size: 12px; color: #4fd08a; line-height: 1.4; }
.warn { margin: 8px 0 0; font-size: 12px; color: var(--warn-text); line-height: 1.45; }
.tris { list-style: none; margin: 0 0 6px; padding: 0; max-height: 190px; overflow-y: auto; }
.tris li { display: flex; align-items: baseline; gap: 8px; padding: 5px 6px; border-radius: 5px; font-size: 13px; }
.tris li:nth-child(odd) { background: var(--row); }
.tris li.poor .no, .tris li.poor .angle { color: #ffa726; }
.tris .angle { font-size: 11px; color: var(--muted-2); font-variant-numeric: tabular-nums; }
.tris .no { color: #7fd6ff; font-weight: 600; }
.tris .sides { flex: 1; font-variant-numeric: tabular-nums; }
.legend { margin: 0 0 8px; font-size: 11px; color: var(--muted-3); }
.stat { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.stat b { color: var(--text-strong); }
.stat b.warn { color: #ffb454; }
.measure { width: 100%; border-collapse: collapse; font-size: 12px; }
.measure th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px 4px; border-bottom: 1px solid var(--border-soft); }
.measure td { padding: 3px 4px; border-bottom: 1px solid var(--row-hover); font-variant-numeric: tabular-nums; }
.measure tr.diag td { color: #7fd6ff; }
button {
  width: 100%; padding: 9px; margin-top: 6px; border-radius: 6px; cursor: pointer;
  background: var(--btn); color: var(--text); border: 1px solid var(--border); font-size: 14px;
}
button:hover:not(:disabled) { background: var(--btn-hover); }
button:disabled { opacity: 0.4; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.primary:hover:not(:disabled) { background: var(--accent-hover); }
button.danger { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text); }
</style>
