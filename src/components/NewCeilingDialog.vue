<script setup lang="ts">
import { ref } from 'vue'
import { useConfigurator } from '../stores/configurator'
import { useProjects } from '../stores/projects'
import { IconRect, IconContour, IconFreeform, IconWizard, IconCircle } from '../icons'
import ShapeWizard from './ShapeWizard.vue'
import type { WallSpec } from '../composables/useWizard'

const store = useConfigurator()
const projects = useProjects()
const name = ref('')
const emit = defineEmits<{ (e: 'close'): void }>()

const kind = ref<'rect' | 'lshape' | 'circle' | 'wizard' | 'empty'>('rect')
const w = ref(3000)
const h = ref(2000)
const d = ref(2000)
const cw = ref(1200)
const ch = ref(800)

function create() {
  // новый потолок — это новый проект: он появится в списке слева
  projects.create(name.value)
  if (kind.value === 'rect') store.insertRectangle(w.value, h.value)
  else if (kind.value === 'lshape') store.insertLShape(w.value, h.value, cw.value, ch.value)
  else if (kind.value === 'circle') store.insertCircle(d.value)
  else store.reset('empty')
  emit('close')
}

/** Мастер отдаёт готовый обход стен — контур строим сразу. */
function createFromWizard(walls: WallSpec[]) {
  projects.create(name.value)
  store.insertFromWalls(walls)
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div :class="['dialog', { wide: kind === 'wizard' }]">
      <h2>Новый потолок</h2>
      <p class="sub">Появится отдельным проектом в списке слева.</p>

      <label class="name">Название
        <input v-model="name" type="text" placeholder="Например: Кухня, Иванов" />
      </label>

      <div class="kinds">
        <button :class="{ on: kind === 'rect' }" @click="kind = 'rect'">
          <div class="ico"><IconRect :size="26" :stroke-width="1.5" /></div><span>Прямоугольник</span>
        </button>
        <button :class="{ on: kind === 'lshape' }" @click="kind = 'lshape'">
          <div class="ico"><IconContour :size="26" :stroke-width="1.5" /></div><span>Г-образный</span>
        </button>
        <button :class="{ on: kind === 'circle' }" @click="kind = 'circle'">
          <div class="ico"><IconCircle :size="26" :stroke-width="1.5" /></div><span>Круг</span>
        </button>
        <button :class="{ on: kind === 'wizard' }" @click="kind = 'wizard'">
          <div class="ico"><IconWizard :size="26" :stroke-width="1.5" /></div><span>Мастер</span>
        </button>
        <button :class="{ on: kind === 'empty' }" @click="kind = 'empty'">
          <div class="ico"><IconFreeform :size="26" :stroke-width="1.5" /></div><span>Пустой лист</span>
        </button>
      </div>

      <ShapeWizard v-if="kind === 'wizard'" @submit="createFromWizard" />

      <div v-else-if="kind === 'circle'" class="fields">
        <label>Диаметр, мм <input type="number" inputmode="decimal" v-model.number="d" min="200" step="100" /></label>
      </div>

      <div v-else-if="kind !== 'empty'" class="fields">
        <label>Ширина, мм <input type="number" inputmode="decimal" v-model.number="w" min="100" step="50" /></label>
        <label>Длина, мм <input type="number" inputmode="decimal" v-model.number="h" min="100" step="50" /></label>
        <template v-if="kind === 'lshape'">
          <label>Вырез: ширина <input type="number" inputmode="decimal" v-model.number="cw" min="50" step="50" /></label>
          <label>Вырез: глубина <input type="number" inputmode="decimal" v-model.number="ch" min="50" step="50" /></label>
        </template>
      </div>
      <p v-else class="hint">
        Чистый холст. Включится режим <b>Рисовать</b>: кликайте по холсту, расставляя углы,
        и замкните контур по первой точке.
      </p>

      <div class="actions">
        <button class="ghost" @click="emit('close')">Отмена</button>
        <button v-if="kind !== 'wizard'" class="primary" @click="create">Создать</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 10, 18, 0.7);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
}
.dialog {
  width: 440px; max-width: 100%; max-height: 92vh; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 14px; padding: 22px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.dialog.wide { width: 720px; }
@media (max-width: 760px) {
  .overlay { padding: 8px; align-items: flex-start; }
  .dialog, .dialog.wide { width: 100%; padding: 16px; max-height: 96vh; }
  .kinds { grid-template-columns: 1fr 1fr; }
}
h2 { margin: 0 0 4px; font-size: 19px; }
.sub { margin: 0 0 16px; color: var(--muted); font-size: 13px; }
.name { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; font-size: 12px; color: var(--muted); }
.name input {
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 8px; padding: 9px 10px; font-size: 14px;
}
.kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.kinds button {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px;
  background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 10px; color: var(--text);
  cursor: pointer; font-size: 12px;
}
.kinds button.on { border-color: var(--accent); background: var(--accent-soft); color: #fff; }
.ico { font-size: 24px; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.fields label { min-width: 0; display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--muted); }
.fields input {
  min-width: 0; /* иначе поля не дают колонкам сжаться и диалог вылезает за экран */
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong); border-radius: 7px;
  padding: 9px 10px; font-size: 15px;
}
.hint { background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 8px; padding: 12px; font-size: 13px; color: var(--text-2); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.actions button { padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; border: 1px solid var(--border); }
.ghost { background: transparent; color: var(--text); }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
</style>
