<script setup lang="ts">
/**
 * Обязательное обновление. Версия ниже минимальной — работать нельзя: цифры и
 * цены на ней могут разойтись с теми, что видят остальные. Выход один —
 * обновиться, поэтому кнопка в окне тоже одна.
 */
import { applyUpdate, version } from '../version'
</script>

<template>
  <div v-if="version.blocked" class="block">
    <div class="card">
      <h2>Нужно обновиться</h2>
      <p>
        Версия {{ version.current }} больше не поддерживается.
        Обновитесь до {{ version.latest }}, чтобы продолжить работу.
      </p>
      <div class="acts">
        <button class="primary" @click="applyUpdate">Обновить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block {
  position: fixed; inset: 0; z-index: 90; background: rgba(6, 10, 18, 0.86);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.card {
  width: 380px; max-width: 100%;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px;
  padding: 24px; box-shadow: 0 20px 60px var(--shadow);
}
h2 { margin: 0 0 8px; font-size: 19px; }
p { margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: var(--text); }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
.primary {
  min-height: 44px; padding: 0 18px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 14px; font-weight: 600;
  background: var(--accent); border: 1px solid var(--accent); color: #fff;
}
</style>
