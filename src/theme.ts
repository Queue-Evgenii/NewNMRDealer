/**
 * Тема приложения. Цвета интерфейса заданы токенами в style.css, здесь только
 * выбор набора: тёмный, светлый или как в системе.
 */
import { ref, watch } from 'vue'

export type ThemeMode = 'system' | 'dark' | 'light'

const KEY = 'nmr.theme'

function stored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch { /* приватный режим — просто берём системную */ }
  return 'system'
}

export const themeMode = ref<ThemeMode>(stored())

/** Что показываем на самом деле: системная тема разворачивается в тёмную или светлую. */
export function resolvedTheme(mode: ThemeMode = themeMode.value): 'dark' | 'light' {
  if (mode !== 'system') return mode
  const mq = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)')
  return mq && mq.matches ? 'light' : 'dark'
}

function apply() {
  const theme = resolvedTheme()
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  try { localStorage.setItem(KEY, mode) } catch { /* ignore */ }
}

/** Вызывается один раз при старте приложения. */
export function initTheme() {
  apply()
  watch(themeMode, apply)
  if (typeof matchMedia === 'function') {
    // системную тему могут переключить на ходу — следуем за ней
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (themeMode.value === 'system') apply()
    })
  }
}
