<script setup lang="ts">
/**
 * Метка обновления в шапке. Намеренно не похожа на остальной интерфейс:
 * синим здесь красят управление чертежом, а это кнопка про саму программу —
 * янтарная, с точкой-маячком. Пока её не нажали, приложение работает на своей
 * сборке, сколько бы раз его ни перезагружали.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { applyUpdate, version } from '../version'
import { IconUpdate } from '../icons'

const { t } = useI18n()
const show = computed(() => version.available || version.ready)
</script>

<template>
  <button v-if="show" class="update" :title="t('update.toVersion', { v: version.latest })"
    @click="applyUpdate">
    <span class="dot"></span>
    <IconUpdate :size="15" :stroke-width="2" />
    <span class="txt">{{ t('update.label', { v: version.latest }) }}</span>
  </button>
</template>

<style scoped>
.update {
  position: relative;
  display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto;
  height: 32px; padding: 0 12px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.01em;
  color: var(--warn-text);
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
}
.update:hover { filter: brightness(1.12); }
/* маячок: обновление ждёт, но ничего не делает без нажатия */
.dot {
  width: 7px; height: 7px; border-radius: 50%; background: currentColor;
  box-shadow: 0 0 0 0 currentColor; animation: pulse 2.4s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  70% { box-shadow: 0 0 0 7px transparent; opacity: 0.75; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
@media (max-width: 900px) {
  /* в узкой шапке остаётся значок с маячком */
  .update { padding: 0 9px; }
  .txt { display: none; }
}
</style>
