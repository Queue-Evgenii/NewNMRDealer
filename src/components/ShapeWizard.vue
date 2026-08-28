<script setup lang="ts">
/**
 * Мастер контура.
 *
 * Углы и стены разведены намеренно. Угол — это место с именем, стена — то,
 * что соединяет два соседних угла. Раньше всё жило в одной строке, и было
 * непонятно, чем строка вообще является: углом или стеной.
 *
 * Модель — обход комнаты с рулеткой: идём от первого угла вправо, меряем
 * стену, в следующем углу поворачиваем, меряем дальше. Последняя стена не
 * вводится: она замыкает контур, её длину считает программа.
 */
import { computed, ref, watch } from 'vue'
import {
  wallsToPoints, closingLength, wizardAreaM2, contourProblem, cornerName, defaultWalls,
  type WallSpec,
} from '../composables/useWizard'
import { IconTurnLeft, IconTurnRight, IconStraight } from '../icons'

const emit = defineEmits<{ (e: 'submit', walls: WallSpec[]): void }>()

const count = ref(4)
const walls = ref<WallSpec[]>(defaultWalls(4))

/**
 * Смена числа углов. Сохраняем введённое, если после этого контур остаётся
 * исправным; иначе берём заготовку на новое число углов, оставив имена.
 * Иначе выходило так: выбрал «6» — и мастер сразу встречает красной ошибкой,
 * потому что к прямоугольнику дописались лишние стены.
 */
watch(count, (n) => {
  const cur = walls.value
  const kept = Array.from({ length: n }, (_, i) => cur[i] ?? { name: '', length: 1000, turn: 90 })
  const fresh = defaultWalls(n).map((w, i) => ({ ...w, name: kept[i]?.name ?? '' }))
  walls.value = contourProblem(wallsToPoints(kept)) ? fresh : kept
})

const points = computed(() => wallsToPoints(walls.value))
const closing = computed(() => closingLength(points.value))
const areaM2 = computed(() => wizardAreaM2(points.value))
/** Что не так с обходом; null — всё в порядке. */
const problem = computed(() => contourProblem(points.value))

/** Имя угла: своё, если ввели, иначе буква по порядку. */
const label = (i: number) => walls.value[i]?.name.trim() || cornerName(i)
/** Куда ведёт стена, начинающаяся в углу i. */
const nextLabel = (i: number) => label((i + 1) % walls.value.length)

const turns = [
  { value: -90, icon: IconTurnLeft, title: 'налево' },
  { value: 90, icon: IconTurnRight, title: 'направо' },
  { value: 0, icon: IconStraight, title: 'прямо, без поворота' },
]

const viewBox = computed(() => {
  const pts = points.value
  if (!pts.length) return '0 0 100 100'
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const pad = Math.max(600, (maxX - minX) * 0.2, (maxY - minY) * 0.2)
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
})
const polyPoints = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))
const dotR = computed(() => {
  const box = viewBox.value.split(' ').map(Number)
  return Math.max(box[2], box[3]) / 70
})
/** Стрелка на первой стене: показывает, куда идёт обход. */
const startArrow = computed(() => {
  const [a, b] = points.value
  if (!a || !b) return ''
  const dx = b.x - a.x; const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len; const uy = dy / len
  const tip = { x: a.x + ux * len * 0.6, y: a.y + uy * len * 0.6 }
  const k = Math.max(len * 0.09, dotR.value * 2)
  return `M${tip.x},${tip.y} L${tip.x - ux * k + uy * k * 0.5},${tip.y - uy * k - ux * k * 0.5}`
    + ` M${tip.x},${tip.y} L${tip.x - ux * k - uy * k * 0.5},${tip.y - uy * k + ux * k * 0.5}`
})

/**
 * Куда отодвинуть подпись угла: против биссектрисы между его стенами.
 * Так подпись всегда уходит в свободное место снаружи угла и не ложится
 * ни на одну из стен — в отличие от простого «наружу от центра фигуры».
 */
const labelSpots = computed(() => {
  const pts = points.value
  const n = pts.length
  const off = dotR.value * 3.4
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n]
    const c = pts[(i + 1) % n]
    let ux = a.x - p.x; let uy = a.y - p.y
    let vx = c.x - p.x; let vy = c.y - p.y
    const lu = Math.hypot(ux, uy) || 1
    const lv = Math.hypot(vx, vy) || 1
    ux /= lu; uy /= lu; vx /= lv; vy /= lv
    let bx = ux + vx; let by = uy + vy
    const bl = Math.hypot(bx, by)
    const dir = bl < 1e-6 ? { x: -uy, y: ux } : { x: -bx / bl, y: -by / bl }
    return { x: p.x + dir.x * off, y: p.y + dir.y * off + off * 0.25, name: p.name }
  })
})

/** Подсвечиваем стену, с которой сейчас работают. */
const hot = ref(-1)
const hotPath = computed(() => {
  const pts = points.value
  if (hot.value < 0 || hot.value >= pts.length) return ''
  const a = pts[hot.value]
  const b = pts[(hot.value + 1) % pts.length]
  return `M${a.x},${a.y} L${b.x},${b.y}`
})

function submit() {
  emit('submit', walls.value.map((w, i) => ({ ...w, name: label(i) })))
}
</script>

<template>
  <div class="wizard">
    <div class="corners">
      <span class="cap">Углов в комнате</span>
      <button :disabled="count <= 3" title="Убрать угол" @click="count -= 1">−</button>
      <b>{{ count }}</b>
      <button :disabled="count >= 16" title="Добавить угол" @click="count += 1">＋</button>
      <div class="quick">
        <button v-for="n in [4, 6, 8]" :key="n" :class="{ on: count === n }" @click="count = n">{{ n }}</button>
      </div>
    </div>

    <!-- углы: только имена, ничего больше -->
    <div class="names">
      <span class="cap">Названия углов</span>
      <div class="chips">
        <input v-for="(w, i) in walls" :key="i" v-model="w.name" type="text"
          :placeholder="cornerName(i)" :title="`Угол ${cornerName(i)}`" />
      </div>
    </div>

    <div class="body">
      <div class="preview">
        <svg :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
          <polygon :points="polyPoints" :class="{ bad: problem }" />
          <path v-if="hotPath" :d="hotPath" class="hot" />
          <path v-if="points.length > 1" :d="startArrow" class="arrow" />
          <circle v-for="(p, i) in points" :key="'d' + i" :cx="p.x" :cy="p.y" :r="dotR" />
          <text v-for="(l, i) in labelSpots" :key="'l' + i" :x="l.x" :y="l.y"
            :font-size="dotR * 3.6">{{ l.name }}</text>
        </svg>
        <div class="sum">
          <span v-if="problem" class="bad-text">{{ problem }}</span>
          <span v-else>Площадь <b>{{ areaM2.toFixed(2) }}</b> м²</span>
        </div>
      </div>

      <!-- стены: каждая соединяет два угла -->
      <div class="walls">
        <span class="cap">Стены</span>
        <div v-for="(w, i) in walls" :key="i" class="wall"
          @mouseenter="hot = i" @mouseleave="hot = -1">
          <span class="path"><b>{{ label(i) }}</b> → <b>{{ nextLabel(i) }}</b></span>

          <template v-if="i < walls.length - 1">
            <input v-model.number="w.length" type="number" inputmode="numeric" min="1" step="10" />
            <span class="turn">
              <span class="turn-cap">поворот в {{ nextLabel(i) }}</span>
              <span class="turns">
                <button v-for="t in turns" :key="t.value" :class="{ on: w.turn === t.value }"
                  :title="'Поворот ' + t.title" @click="w.turn = t.value">
                  <component :is="t.icon" :size="14" :stroke-width="1.75" />
                </button>
              </span>
            </span>
          </template>

          <template v-else>
            <span class="closing">{{ closing }}</span>
            <span class="turn"><span class="turn-cap">замыкает контур — считается сама</span></span>
          </template>
        </div>
      </div>
    </div>

    <button class="go" :disabled="!!problem || areaM2 <= 0" @click="submit">Построить контур</button>
  </div>
</template>

<style scoped>
.wizard { display: flex; flex-direction: column; gap: 12px; }
.cap { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-3); }

.corners { display: flex; align-items: center; gap: 8px; }
.corners b { min-width: 22px; text-align: center; color: var(--text-strong); font-size: 15px; }
.corners button {
  width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.corners button:disabled { opacity: 0.35; cursor: default; }
.quick { display: flex; gap: 4px; margin-left: auto; }
.quick button { width: 32px; }
.quick button.on { background: var(--accent); border-color: var(--accent); color: #fff; }

.names { display: flex; flex-direction: column; gap: 5px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips input {
  width: 74px; padding: 5px 8px; border-radius: 7px; font-size: 13px; text-align: center;
  background: var(--field); border: 1px solid var(--border); color: #ffd54a;
}
.chips input:focus { border-color: var(--accent); outline: none; }

.body { display: grid; grid-template-columns: 200px 1fr; gap: 14px; align-items: start; }

.preview { display: flex; flex-direction: column; gap: 6px; }
.preview svg {
  width: 100%; height: 180px; background: var(--field);
  border: 1px solid var(--border-strong); border-radius: 10px;
}
.preview polygon {
  fill: rgba(90, 160, 255, 0.18); stroke: #4fd08a; stroke-width: 2px; vector-effect: non-scaling-stroke;
}
.preview polygon.bad { fill: rgba(255, 107, 107, 0.15); stroke: #ff6b6b; }
.preview circle { fill: var(--handle-fill); stroke: #5aa0ff; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
.preview text { fill: #ffd54a; text-anchor: middle; }
.preview .arrow { fill: none; stroke: #7fd6ff; stroke-width: 2px; vector-effect: non-scaling-stroke; }
.preview .hot { fill: none; stroke: #ffd54a; stroke-width: 4px; vector-effect: non-scaling-stroke; }
.sum { font-size: 12px; color: var(--muted); text-align: center; }
.sum b { color: var(--text-strong); font-size: 14px; }
.bad-text { color: var(--danger-text); line-height: 1.4; }

.walls { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.wall {
  display: grid; grid-template-columns: 92px 84px 1fr; gap: 8px; align-items: center;
  padding: 4px 6px; border-radius: 7px;
}
.wall:hover { background: var(--row); }
.path { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.path b { color: #ffd54a; font-weight: 600; }
.wall input {
  min-width: 0; padding: 6px 8px; border-radius: 6px; font-size: 13px;
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
}
.closing { font-size: 13px; color: var(--muted-2); text-align: center; }
.turn { display: flex; align-items: center; gap: 7px; min-width: 0; }
.turn-cap { font-size: 11px; color: var(--muted-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.turns { display: flex; gap: 2px; margin-left: auto; flex: 0 0 auto; }
.turns button {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 28px; border-radius: 6px; cursor: pointer;
  background: var(--btn); border: 1px solid var(--border); color: var(--text-2);
}
.turns button.on { background: var(--accent); border-color: var(--accent); color: #fff; }

.go {
  width: 100%; padding: 11px; border-radius: 9px; cursor: pointer; font-size: 15px; font-weight: 600;
  background: var(--accent); border: none; color: #fff;
}
.go:disabled { opacity: 0.4; cursor: default; }

/* на узком экране стена занимает две строки: связь углов и длина, затем поворот */
@media (max-width: 700px) {
  .body { grid-template-columns: 1fr; }
  .preview svg { height: 150px; }
  .wall {
    grid-template-columns: 1fr 96px;
    gap: 6px 8px;
    padding: 8px;
    background: var(--bar);
    border: 1px solid var(--border-soft);
  }
  .path { font-size: 14px; }
  .wall input, .closing { grid-column: 2; }
  .turn { grid-column: 1 / -1; justify-content: space-between; }
  .turns button { width: 44px; height: 38px; }
  .chips input { width: 68px; padding: 8px; font-size: 14px; }
  .corners button { width: 34px; height: 34px; }
  .quick button { width: 38px; height: 34px; }
  .go { padding: 14px; }
}
</style>
