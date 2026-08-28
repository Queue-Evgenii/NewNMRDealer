<script setup lang="ts">
/**
 * Свой пикер цвета: квадрат «насыщенность × яркость» и полоса оттенка.
 *
 * Нативный <input type="color"> не берём: в PWA и в webview Capacitor он
 * открывает системное окно (а где-то не открывает вовсе), выглядит чужеродно
 * и не даёт показать цвет прямо на чертеже. Здесь всё своё и работает
 * одинаково мышью и пальцем — на указателях, без отдельной ветки для touch.
 */
import { computed, ref, watch } from 'vue'
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../ceilingColors'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', hex: string): void }>()

// оттенок держим отдельно: у чёрного и белого он не выводится из цвета,
// иначе ползунок прыгал бы на красный при каждом заходе в тёмный угол
const hsv = ref<Hsv>(hexToHsv(props.modelValue))
watch(() => props.modelValue, (hex) => {
  if (hsvToHex(hsv.value) === hex) return // цвет пришёл от нас самих
  const next = hexToHsv(hex)
  const flat = next.s < 0.01 || next.v < 0.01 // у чёрного и белого оттенка нет
  hsv.value = { ...next, h: flat ? hsv.value.h : next.h }
})

const hueColor = computed(() => hsvToHex({ h: hsv.value.h, s: 1, v: 1 }))
const dot = computed(() => ({ left: `${hsv.value.s * 100}%`, top: `${(1 - hsv.value.v) * 100}%` }))
const hueDot = computed(() => ({ left: `${(hsv.value.h / 360) * 100}%` }))

function push(next: Hsv) {
  hsv.value = next
  emit('update:modelValue', hsvToHex(next))
}

/** Тянем по области: одна обработка на нажатие, движение и палец. */
function track(ev: PointerEvent, to: (frac: { x: number; y: number }) => Hsv) {
  const el = ev.currentTarget as HTMLElement
  el.setPointerCapture(ev.pointerId)
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    push(to({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }))
  }
  move(ev)
  const stop = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', stop)
    el.removeEventListener('pointercancel', stop)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
}
const onArea = (ev: PointerEvent) => track(ev, ({ x, y }) => ({ h: hsv.value.h, s: x, v: 1 - y }))
const onHue = (ev: PointerEvent) => track(ev, ({ x }) => ({ ...hsv.value, h: x * 360 }))

/** Стрелками — точная доводка с клавиатуры, шаг крупнее с Shift. */
const clamp = (v: number) => Math.min(1, Math.max(0, v))
function bump(ev: KeyboardEvent, mode: 'area' | 'hue') {
  const dx = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0
  const dy = ev.key === 'ArrowDown' ? -1 : ev.key === 'ArrowUp' ? 1 : 0
  if (!dx && !dy) return
  ev.preventDefault()
  const step = (ev.shiftKey ? 10 : 1) / 100
  if (mode === 'hue') push({ ...hsv.value, h: (hsv.value.h + dx * step * 360 + 360) % 360 })
  else push({ h: hsv.value.h, s: clamp(hsv.value.s + dx * step), v: clamp(hsv.value.v + dy * step) })
}

const draft = ref('')
const hexText = computed(() => (draft.value || props.modelValue.toUpperCase()))
function applyHex(v: string) {
  const h = normalizeHex(v)
  draft.value = ''
  if (h) { hsv.value = hexToHsv(h); emit('update:modelValue', h) }
}
</script>

<template>
  <div class="picker">
    <div class="area" :style="{ '--hue': hueColor }" tabindex="0"
      role="slider" aria-label="Насыщенность и яркость"
      @pointerdown.prevent="onArea" @keydown="bump($event, 'area')">
      <span class="knob" :style="{ ...dot, background: modelValue }"></span>
    </div>
    <div class="hue" tabindex="0" role="slider" aria-label="Оттенок"
      @pointerdown.prevent="onHue" @keydown="bump($event, 'hue')">
      <span class="knob" :style="{ ...hueDot, background: hueColor }"></span>
    </div>
    <div class="row">
      <span class="preview" :style="{ background: modelValue }"></span>
      <input class="hex" type="text" maxlength="7" spellcheck="false"
        :value="hexText" @input="draft = ($event.target as HTMLInputElement).value"
        @change="applyHex(($event.target as HTMLInputElement).value)"
        @keyup.enter="applyHex(($event.target as HTMLInputElement).value)" />
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 10px; }
.area, .hue { position: relative; touch-action: none; cursor: crosshair; border-radius: 10px; }
.area:focus-visible, .hue:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.area {
  height: 140px;
  background:
    linear-gradient(to top, #000, rgba(0, 0, 0, 0)),
    linear-gradient(to right, #fff, var(--hue));
  border: 1px solid var(--border);
}
.hue {
  height: 26px;
  background: linear-gradient(to right,
    #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
  border: 1px solid var(--border);
}
.knob {
  position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
  border-radius: 50%; border: 2px solid #fff; pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.45);
}
.row { display: flex; align-items: center; gap: 8px; }
.preview { width: 40px; height: 38px; flex: 0 0 auto; border-radius: 8px; border: 1px solid var(--border); }
.hex {
  flex: 1 1 auto; min-width: 0; text-transform: uppercase;
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 8px; padding: 9px 10px; font: inherit; font-size: 14px;
}
@media (max-width: 760px) {
  .area { height: 160px; }
  .hue { height: 32px; }
  .knob { width: 22px; height: 22px; margin: -11px 0 0 -11px; }
}
</style>
