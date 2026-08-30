<script setup lang="ts">
/**
 * Справка: что здесь есть, коротко. Текст разный под мышь и под палец —
 * жесты и клавиши у них не совпадают, и общий вариант врал бы обоим.
 * Где что лежит, показывает обучение по интерфейсу (TourOverlay).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@vueuse/core'
import {
  IconSelect, IconDraw, IconRuler, IconMeasure, IconClose,
  IconNewShape, IconDimensions, IconColors, IconLogo,
} from '../icons'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'close'): void; (e: 'tour'): void }>()

/** Палец или мышь: у них разные жесты, а клавиши есть только у мыши. */
const touch = useMediaQuery('(pointer: coarse)')

const MODES = computed(() => [
  { icon: IconSelect, name: t('mode.select'), key: 'V', what: t('help.modeSelect') },
  { icon: IconDraw, name: t('mode.draw'), key: 'D', what: t('help.modeDraw') },
  { icon: IconRuler, name: t('mode.ruler'), key: 'R', what: t('help.modeRuler') },
  { icon: IconMeasure, name: t('mode.measure'), key: 'T', what: t('help.modeMeasure') },
])

const CAN = computed(() => [
  { icon: IconNewShape, what: t('help.canShape') },
  { icon: IconDimensions, what: t('help.canDims') },
  { icon: IconColors, what: t('help.canColor') },
  { icon: IconLogo, what: t('help.canPrice') },
])
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet" role="dialog" :aria-label="t('help.title')">
      <button class="x" :title="t('common.close')" @click="emit('close')">
        <IconClose :size="18" :stroke-width="1.75" />
      </button>

      <h2>{{ t('help.title') }}</h2>

      <h3>{{ t('help.modes') }}</h3>
      <ul class="modes">
        <li v-for="m in MODES" :key="m.name">
          <component :is="m.icon" :size="16" :stroke-width="1.75" />
          <b>{{ m.name }}</b>
          <kbd v-if="!touch">{{ m.key }}</kbd>
          <span>{{ m.what }}</span>
        </li>
      </ul>

      <h3>{{ t('help.can') }}</h3>
      <ul class="can">
        <li v-for="c in CAN" :key="c.what">
          <component :is="c.icon" :size="16" :stroke-width="1.75" />
          <span>{{ c.what }}</span>
        </li>
      </ul>

      <h3>{{ touch ? t('help.gestures') : t('help.controls') }}</h3>
      <ul class="keys">
        <template v-if="touch">
          <li><b>{{ t('help.tap') }}</b><span>{{ t('help.tapWhat') }}</span></li>
          <li><b>{{ t('help.drag') }}</b><span>{{ t('help.dragWhat') }}</span></li>
          <li><b>{{ t('help.twoFingers') }}</b><span>{{ t('help.twoFingersWhat') }}</span></li>
          <li><b>{{ t('help.plusHandle') }}</b><span>{{ t('help.plusHandleWhat') }}</span></li>
        </template>
        <template v-else>
          <!-- клавиши остаются латиницей: их печатают на клавиатуре, а не читают -->
          <li><kbd>{{ t('help.wheel') }}</kbd><span>{{ t('help.wheelWhat', { space: t('help.space') }) }}</span></li>
          <li><kbd>Ctrl+Z</kbd><span>{{ t('help.undoWhat', { redo: 'Ctrl+Y' }) }}</span></li>
          <li><kbd>G</kbd><span>{{ t('help.gridWhat', { dims: 'M', snap: 'S' }) }}</span></li>
          <li><kbd>C</kbd><span>{{ t('help.closeWhat', { del: 'Del' }) }}</span></li>
        </template>
      </ul>

      <div class="acts">
        <button class="ghost" @click="emit('close')">{{ t('common.later') }}</button>
        <button class="primary" @click="emit('tour')">{{ t('help.startTour') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 10, 18, 0.7); z-index: 60;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.sheet {
  position: relative; width: 460px; max-width: 100%; max-height: 92vh; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px;
  padding: 22px; box-shadow: 0 20px 60px var(--shadow);
}
.x {
  position: absolute; top: 12px; right: 12px;
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
  background: none; border: none; color: var(--muted);
}
.x:hover { background: var(--btn-hover); color: var(--text); }
h2 { margin: 0 0 14px; font-size: 19px; }
h3 {
  margin: 16px 0 8px; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--muted);
}
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
li { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.4; color: var(--muted); }
li svg { flex: 0 0 auto; color: var(--text-2); }
li b { flex: 0 0 auto; color: var(--text-strong); font-weight: 600; }
li span { min-width: 0; }
kbd {
  flex: 0 0 auto; padding: 2px 6px; border-radius: 5px; font: inherit; font-size: 11px;
  background: var(--field); border: 1px solid var(--border); color: var(--text-2);
}
.acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.acts button {
  min-height: 44px; padding: 0 18px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 14px;
  border: 1px solid var(--border);
}
.ghost { background: transparent; color: var(--text); }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
@media (max-width: 760px) {
  .overlay { padding: 0; align-items: flex-end; }
  .sheet {
    width: 100%; max-height: 88vh; border-radius: 16px 16px 0 0;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  }
}
</style>
