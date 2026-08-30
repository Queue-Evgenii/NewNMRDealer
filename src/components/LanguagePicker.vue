<script setup lang="ts">
/**
 * Выбор языка: флаг, название на самом языке, галочка у текущего.
 *
 * Свой список вместо <select>: родной нельзя оформить и в него не положишь
 * картинку, а флаг — это то, что находят глазами, не читая. Список
 * прокручивается, поэтому двадцать языков лягут так же, как три.
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { LOCALES, LOCALE_NAMES, currentLocale, setLocale, type Locale } from '../i18n'
import { IconCheck, IconChevronDown } from '../icons'

const open = ref(false)
const cursor = ref(0)
const rootEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const locale = computed(() => currentLocale())

/** Флаг лежит рядом с приложением и называется по коду языка. */
const flagSrc = (l: Locale) => `${import.meta.env.BASE_URL}flags/${l}.svg`
/** Языка без флага быть не должно, но если файл потеряется — строка не поедет. */
const hideBroken = (e: Event) => ((e.target as HTMLImageElement).style.visibility = 'hidden')

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  cursor.value = Math.max(0, LOCALES.indexOf(locale.value))
  await nextTick()
  listEl.value?.querySelector<HTMLElement>('[data-on]')?.scrollIntoView({ block: 'nearest' })
}

function pick(l: Locale) {
  setLocale(l)
  open.value = false
}

function move(step: number) {
  const n = LOCALES.length
  cursor.value = (cursor.value + step + n) % n
  nextTick(() => {
    listEl.value?.children[cursor.value]?.scrollIntoView({ block: 'nearest' })
  })
}

function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); toggle() }
    return
  }
  if (e.code === 'Escape') { e.stopPropagation(); open.value = false; return }
  if (e.code === 'ArrowDown') { e.preventDefault(); move(1); return }
  if (e.code === 'ArrowUp') { e.preventDefault(); move(-1); return }
  if (e.code === 'Home') { e.preventDefault(); cursor.value = 0; return }
  if (e.code === 'End') { e.preventDefault(); cursor.value = LOCALES.length - 1; return }
  if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); pick(LOCALES[cursor.value]) }
}

// закрываем по нажатию мимо — на фазе захвата, как в остальных окнах
function onDocPointer(e: PointerEvent) {
  if (open.value && !rootEl.value?.contains(e.target as Node)) open.value = false
}
document.addEventListener('pointerdown', onDocPointer, true)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true))
</script>

<template>
  <div ref="rootEl" class="picker" @keydown="onKey">
    <button class="current" type="button" :aria-expanded="open" aria-haspopup="listbox" @click="toggle">
      <img class="flag" :src="flagSrc(locale)" alt="" width="20" height="15" @error="hideBroken" />
      <span class="name" :lang="locale">{{ LOCALE_NAMES[locale] }}</span>
      <IconChevronDown class="chev" :class="{ up: open }" :size="16" :stroke-width="1.75" />
    </button>

    <ul v-if="open" ref="listEl" class="list" role="listbox">
      <li v-for="(l, i) in LOCALES" :key="l" role="option" :aria-selected="l === locale"
        :class="{ on: l === locale, hot: i === cursor }" :data-on="l === locale ? '' : undefined"
        @click="pick(l)" @mousemove="cursor = i">
        <img class="flag" :src="flagSrc(l)" alt="" width="20" height="15" @error="hideBroken" />
        <span class="name" :lang="l">{{ LOCALE_NAMES[l] }}</span>
        <IconCheck v-if="l === locale" :size="15" :stroke-width="2.5" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker { position: relative; }
.current, .list li {
  display: flex; align-items: center; gap: 10px; width: 100%;
  min-height: 44px; padding: 0 10px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 14px; text-align: left;
}
.current {
  background: var(--field); border: 1px solid var(--border); color: var(--text-strong);
}
.current:hover { background: var(--btn-hover); }
.name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* флаги узкие и разной высоты — рамка держит их в одном габарите */
.flag {
  flex: 0 0 auto; width: 20px; height: 15px; object-fit: cover; border-radius: 2px;
  box-shadow: 0 0 0 1px var(--border);
}
.chev { flex: 0 0 auto; color: var(--muted); transition: transform 0.15s; }
.chev.up { transform: rotate(180deg); }

.list {
  position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0;
  max-height: 232px; overflow-y: auto; /* дальше пятой строки — прокруткой */
  list-style: none; margin: 0; padding: 4px;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 10px;
  box-shadow: 0 12px 32px var(--shadow);
}
.list li { color: var(--text); }
.list li.hot { background: var(--btn-hover); }
.list li.on { color: var(--text-strong); font-weight: 600; }
.list li.on svg { color: var(--accent); }
</style>
