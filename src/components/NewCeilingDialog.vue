<script setup lang="ts">
import { ref } from 'vue'
import { useConfigurator } from '../stores/configurator'
import { IconRect, IconContour, IconFreeform } from '../icons'

const store = useConfigurator()
const emit = defineEmits<{ (e: 'close'): void }>()

const kind = ref<'rect' | 'lshape' | 'empty'>('rect')
const w = ref(3000)
const h = ref(2000)
const cw = ref(1200)
const ch = ref(800)

function create() {
  if (kind.value === 'rect') store.insertRectangle(w.value, h.value)
  else if (kind.value === 'lshape') store.insertLShape(w.value, h.value, cw.value, ch.value)
  else store.reset('empty')
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2>Новый потолок</h2>
      <p class="sub">Выберите форму комнаты и введите размеры в миллиметрах.</p>

      <div class="kinds">
        <button :class="{ on: kind === 'rect' }" @click="kind = 'rect'">
          <div class="ico"><IconRect :size="26" :stroke-width="1.5" /></div><span>Прямоугольник</span>
        </button>
        <button :class="{ on: kind === 'lshape' }" @click="kind = 'lshape'">
          <div class="ico"><IconContour :size="26" :stroke-width="1.5" /></div><span>Г-образный</span>
        </button>
        <button :class="{ on: kind === 'empty' }" @click="kind = 'empty'">
          <div class="ico"><IconFreeform :size="26" :stroke-width="1.5" /></div><span>Рисовать с нуля</span>
        </button>
      </div>

      <div v-if="kind !== 'empty'" class="fields">
        <label>Ширина, мм <input type="number" inputmode="decimal" v-model.number="w" min="100" step="50" /></label>
        <label>Длина, мм <input type="number" inputmode="decimal" v-model.number="h" min="100" step="50" /></label>
        <template v-if="kind === 'lshape'">
          <label>Вырез: ширина <input type="number" inputmode="decimal" v-model.number="cw" min="50" step="50" /></label>
          <label>Вырез: глубина <input type="number" inputmode="decimal" v-model.number="ch" min="50" step="50" /></label>
        </template>
      </div>
      <p v-else class="hint">
        Нажмите «Создать», затем инструментом <b>+ Добавить</b> кликайте по холсту,
        расставляя углы комнаты. Замкните контур кнопкой <b>Контур</b>.
      </p>

      <div class="actions">
        <button class="ghost" @click="emit('close')">Отмена</button>
        <button class="primary" @click="create">Создать</button>
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
  width: 440px; max-width: 100%; background: #141c2e; border: 1px solid #263250;
  border-radius: 14px; padding: 22px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
h2 { margin: 0 0 4px; font-size: 19px; }
.sub { margin: 0 0 16px; color: #8fa3c4; font-size: 13px; }
.kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.kinds button {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px;
  background: #0f1728; border: 1px solid #263250; border-radius: 10px; color: #cbd5e1;
  cursor: pointer; font-size: 12px;
}
.kinds button.on { border-color: #2f6fed; background: #16233f; color: #fff; }
.ico { font-size: 24px; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.fields label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: #8fa3c4; }
.fields input {
  background: #0d1320; border: 1px solid #2a3550; color: #e8eefc; border-radius: 7px;
  padding: 9px 10px; font-size: 15px;
}
.hint { background: #0f1728; border: 1px solid #263250; border-radius: 8px; padding: 12px; font-size: 13px; color: #a9b8d4; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.actions button { padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; border: 1px solid #2a3550; }
.ghost { background: transparent; color: #cbd5e1; }
.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; font-weight: 600; }
</style>
