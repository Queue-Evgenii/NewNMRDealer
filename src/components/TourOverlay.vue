<script setup lang="ts">
/**
 * Подсветка элемента и подпись к нему. Тёмное поле — это огромная тень вокруг
 * «окошка», поэтому дырку не нужно вырезать масками и она всегда точна.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { markTourSeen, placeCard, selectorOf, visibleSteps, type TourStep } from '../composables/useTour'
import { IconClose } from '../icons'

const emit = defineEmits<{ (e: 'close'): void }>()

const steps = ref<TourStep[]>([])
const index = ref(0)
const spot = ref({ top: 0, left: 0, width: 0, height: 0 })
const cardEl = ref<HTMLElement | null>(null)
const cardPos = ref({ top: 0, left: 0 })

const step = computed<TourStep | null>(() => steps.value[index.value] ?? null)
const last = computed(() => index.value >= steps.value.length - 1)

const PAD = 8

async function measure() {
  const s = step.value
  const el = s && document.querySelector(selectorOf(s))
  if (!el) return
  const r = el.getBoundingClientRect()
  spot.value = {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  }
  // карточку ставим по её настоящему размеру: текст в шагах разной длины
  await nextTick()
  const box = cardEl.value?.getBoundingClientRect()
  cardPos.value = placeCard(
    spot.value,
    { width: box?.width ?? 320, height: box?.height ?? 180 },
    window.innerWidth,
    window.innerHeight,
  )
}
const card = computed(() => ({ top: `${cardPos.value.top}px`, left: `${cardPos.value.left}px` }))

function go(delta: number) {
  const next = index.value + delta
  if (next < 0) return
  if (next >= steps.value.length) return finish()
  index.value = next
  measure()
}
function finish() {
  markTourSeen()
  emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') finish()
  if (e.key === 'ArrowRight' || e.key === 'Enter') go(1)
  if (e.key === 'ArrowLeft') go(-1)
}

onMounted(() => {
  steps.value = visibleSteps()
  if (!steps.value.length) return finish()
  measure()
  window.addEventListener('resize', measure)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="step" class="tour">
    <div class="spot" :style="{
      top: spot.top + 'px', left: spot.left + 'px',
      width: spot.width + 'px', height: spot.height + 'px',
    }"></div>

    <div ref="cardEl" class="card" :style="card">
      <div class="head">
        <span class="no">{{ index + 1 }} / {{ steps.length }}</span>
        <button class="x" title="Пропустить" @click="finish">
          <IconClose :size="16" :stroke-width="1.75" />
        </button>
      </div>
      <h3>{{ step.title }}</h3>
      <p>{{ step.text }}</p>
      <div class="acts">
        <button v-if="index > 0" class="ghost" @click="go(-1)">Назад</button>
        <button class="primary" @click="go(1)">{{ last ? 'Готово' : 'Далее' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 70; }
/* дырка в затемнении — это тень вокруг пустого блока */
.spot {
  position: fixed; border-radius: 12px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(6, 10, 18, 0.72), 0 0 0 2px var(--accent) inset;
  transition: top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease;
}
.card {
  position: fixed; width: 320px; max-width: calc(100vw - 20px);
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 12px;
  padding: 14px; box-shadow: 0 18px 44px var(--shadow);
}
.head { display: flex; align-items: center; justify-content: space-between; }
.no { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.x {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
  background: none; border: none; color: var(--muted);
}
.x:hover { background: var(--btn-hover); color: var(--text); }
h3 { margin: 6px 0 4px; font-size: 15px; color: var(--text-strong); }
p { margin: 0 0 12px; font-size: 13px; line-height: 1.45; color: var(--text-2); }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
.acts button {
  min-height: 40px; padding: 0 16px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 14px;
  border: 1px solid var(--border);
}
.ghost { background: transparent; color: var(--text); }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
@media (max-width: 760px) {
  /* по ширине — во весь экран, по высоте по-прежнему мимо подсветки */
  .card { left: 10px !important; right: 10px; width: auto; }
}
</style>
