<script setup lang="ts">
/**
 * Базовые настройки приложения. Всё применяется сразу — окно только закрывают.
 */
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { themeMode, setTheme, type ThemeMode } from '../theme'
import { IconClose } from '../icons'

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useConfigurator()
const { settings } = storeToRefs(store)

const THEMES: { id: ThemeMode; name: string }[] = [
  { id: 'system', name: 'Как в системе' },
  { id: 'dark', name: 'Тёмная' },
  { id: 'light', name: 'Светлая' },
]
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Настройки">
      <header class="head">
        <h2>Настройки</h2>
        <button class="x" title="Закрыть" @click="emit('close')">
          <IconClose :size="18" :stroke-width="1.75" />
        </button>
      </header>

      <section>
        <h3>Тема</h3>
        <div class="themes">
          <button v-for="t in THEMES" :key="t.id" :class="{ on: themeMode === t.id }"
            @click="setTheme(t.id)">{{ t.name }}</button>
        </div>
      </section>

      <section>
        <h3>Чертёж</h3>
        <label class="row"><span>Шаг сетки, мм</span>
          <input type="number" inputmode="decimal" min="10" step="10" :value="settings.gridStep"
            @change="store.updateSettings({ gridStep: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label class="row"><span>Усадка полотна, %</span>
          <input type="number" inputmode="decimal" min="0" step="0.5" :value="settings.usad"
            @change="store.updateSettings({ usad: Number(($event.target as HTMLInputElement).value) })" /></label>
      </section>

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
  width: 380px; max-width: 100%; max-height: 92vh; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px;
  padding: 18px; box-shadow: 0 20px 60px var(--shadow);
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
section { margin-top: 14px; }
.x {
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.x:hover { background: var(--btn-hover); }
.themes { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.themes button {
  min-height: 44px; padding: 0 8px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.themes button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.row input {
  width: 120px; background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
  border-radius: 8px; padding: 9px 10px; font: inherit; font-size: 14px;
}
.done {
  align-self: flex-end; margin-top: 16px; padding: 10px 20px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 14px; font-weight: 600;
  background: var(--accent); border: 1px solid var(--accent); color: #fff;
}
@media (max-width: 760px) {
  .overlay { padding: 0; align-items: flex-end; }
  .dialog {
    width: 100%; border-radius: 16px 16px 0 0;
    padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  }
}
</style>
