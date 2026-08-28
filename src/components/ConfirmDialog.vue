<script setup lang="ts">
// Подтверждение опасного действия. Свой диалог вместо confirm(): системное
// окно нельзя оформить, а на телефоне в вебвью его вид непредсказуем.
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { IconWarning } from '../icons'

withDefaults(defineProps<{
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>(), { confirmText: 'Удалить', cancelText: 'Отмена', danger: true })

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()

const okBtn = ref<HTMLButtonElement | null>(null)

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') { e.stopPropagation(); emit('cancel') }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.stopPropagation(); emit('confirm') }
}
// перехватываем на фазе захвата, иначе Esc сначала поймают горячие клавиши
onMounted(() => { window.addEventListener('keydown', onKey, true); okBtn.value?.focus() })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <div class="dialog" role="alertdialog" aria-modal="true">
      <div class="top">
        <span :class="['mark', { danger }]"><IconWarning :size="18" :stroke-width="1.9" /></span>
        <h3>{{ title }}</h3>
      </div>
      <p v-if="message" class="msg">{{ message }}</p>
      <div class="acts">
        <button class="ghost" @click="emit('cancel')">{{ cancelText }}</button>
        <button ref="okBtn" :class="['go', { danger }]" @click="emit('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 10, 18, 0.7);
  display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px;
}
.dialog {
  width: 380px; max-width: 100%;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 14px; padding: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.top { display: flex; align-items: center; gap: 10px; }
.top h3 { margin: 0; font-size: 16px; color: var(--text-accent); }
.mark {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 9px; flex: 0 0 auto;
  background: var(--btn); border: 1px solid var(--border); color: var(--text-2);
}
.mark.danger { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text); }
.msg { margin: 12px 0 0; font-size: 13px; line-height: 1.5; color: var(--text-2); }
.acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.acts button {
  padding: 9px 16px; border-radius: 9px; cursor: pointer; font-size: 14px;
  background: var(--btn); border: 1px solid var(--border); color: var(--text);
}
.acts button:hover { background: var(--btn-hover); }
.go { background: var(--accent); border-color: var(--accent); color: #fff; }
.go:hover { background: var(--accent-hover); }
.go.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.go.danger:hover { background: var(--danger); }
@media (max-width: 640px) {
  .dialog { width: 100%; }
  .acts button { flex: 1; padding: 12px; }
}
</style>
