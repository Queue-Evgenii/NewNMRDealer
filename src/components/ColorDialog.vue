<script setup lang="ts">
/**
 * Цвет и плёнка полотна. Применяется сразу: чертёж за окном перекрашивается
 * на глазах, кнопка внизу только закрывает. На телефоне — нижняя шторка.
 */
import { computed, ref } from 'vue'
import { useConfigurator } from '../stores/configurator'
import { BASIC_COLORS, isLight } from '../ceilingColors'
import { FILMS, filmColor } from '../filmColors'
import ColorPicker from './ColorPicker.vue'
import { IconCheck, IconClose, IconChevronDown, IconChevronUp } from '../icons'

const props = defineProps<{ shapeId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useConfigurator()
const shape = computed(() => store.shapes.find((s) => s.id === props.shapeId))
const color = computed(() => shape.value?.colorHex ?? BASIC_COLORS[0].hex)
const film = computed(() => shape.value?.film ?? FILMS[0])

// свой оттенок нужен редко: обычно берут образец, поэтому пикер закрыт
const custom = ref(false)

const setColor = (hex: string) => store.setShapeColor(props.shapeId, hex)
const setFilm = (name: string) => store.setShapeFilm(props.shapeId, name)

/** Образец «как на потолке»: цвет плюс блеск выбранной плёнки. */
const preview = computed(() => {
  const c = color.value
  if (film.value === 'Мат') return { background: c }
  if (film.value === 'Фактура') {
    return { background: `repeating-linear-gradient(135deg, ${c} 0 6px, rgba(255,255,255,0.07) 6px 12px), ${c}` }
  }
  const gloss = film.value === 'Сатин' ? '0.16' : '0.42'
  return { background: `linear-gradient(118deg, rgba(255,255,255,${gloss}) 0%, rgba(255,255,255,0) 42%), ${c}` }
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Цвет полотна">
      <header class="head">
        <h2>Цвет полотна</h2>
        <button class="x" title="Закрыть" @click="emit('close')">
          <IconClose :size="18" :stroke-width="1.75" />
        </button>
      </header>

      <div class="current" :style="preview">
        <span class="badge" :style="{ color: isLight(color) ? 'var(--bg)' : '#ffffff' }">
          {{ film }} · {{ color.toUpperCase() }}
        </span>
      </div>

      <div class="scroll">
        <div class="grid">
          <button v-for="c in BASIC_COLORS" :key="c.hex" class="cell"
            :title="`${c.name} · ${c.hex}`" @click="setColor(c.hex)">
            <span class="sw" :class="{ on: c.hex === color }" :style="{ background: c.hex }">
              <IconCheck v-if="c.hex === color" :size="16" :stroke-width="2.5"
                :color="isLight(c.hex) ? 'var(--bg)' : '#ffffff'" />
            </span>
            <span class="lbl">{{ c.name }}</span>
          </button>
        </div>

        <button class="more" @click="custom = !custom">
          Свой оттенок
          <component :is="custom ? IconChevronUp : IconChevronDown" :size="16" :stroke-width="1.75" />
        </button>
        <ColorPicker v-if="custom" :model-value="color" @update:model-value="setColor" />

        <div class="films">
          <button v-for="f in FILMS" :key="f" :class="{ on: f === film }" @click="setFilm(f)">
            <span class="film-dot" :style="{ background: filmColor(f) }"></span>{{ f }}
          </button>
        </div>
      </div>

      <button class="done" @click="emit('close')">Готово</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 10, 18, 0.7); z-index: 60;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.dialog {
  display: flex; flex-direction: column;
  width: 420px; max-width: 100%; max-height: 92vh;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px;
  padding: 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
h2 { margin: 0; font-size: 18px; }
.x {
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.x:hover { background: var(--btn-hover); }
.current {
  height: 60px; margin: 14px 0 0; border-radius: 10px;
  border: 1px solid var(--border); display: flex; align-items: flex-end; padding: 8px 12px;
}
.badge { font-size: 13px; font-variant-numeric: tabular-nums; }
.scroll {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: 16px;
  /* место под полосу прокрутки, иначе она ложится на правый столбец образцов */
  padding: 16px 12px 16px 0; scrollbar-gutter: stable;
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 8px; }
.cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 0; background: none; border: none; color: var(--text-2); cursor: pointer; font: inherit;
}
.sw {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 1; min-height: 44px; border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 -8px 14px rgba(0, 0, 0, 0.18);
}
.cell:hover .sw { border-color: var(--accent-2); }
.sw.on { outline: 2px solid var(--accent); outline-offset: 2px; }
.lbl {
  max-width: 100%; font-size: 10px; line-height: 1.2; text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.more {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 11px 12px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 14px;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.more:hover { background: var(--btn-hover); }
.films { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.films button {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px;
  border-radius: 8px; cursor: pointer; font: inherit; font-size: 14px;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.films button.on { background: var(--accent-soft); border-color: var(--accent); color: #fff; }
.film-dot { width: 12px; height: 12px; flex: 0 0 auto; border-radius: 4px; }
.done {
  align-self: flex-end; padding: 10px 20px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 14px; font-weight: 600;
  background: var(--accent); border: 1px solid var(--accent); color: #fff;
}
@media (max-width: 760px) {
  .overlay { padding: 0; align-items: flex-end; }
  .dialog {
    width: 100%; max-height: 88vh; border-radius: 16px 16px 0 0;
    padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  }
  .grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }
}
</style>
