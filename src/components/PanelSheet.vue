<script setup lang="ts">
// Нижняя шторка для телефона: свёрнутая показывает главные цифры,
// развёрнутая — обычную боковую панель. Тап по шапке переключает.
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigurator } from '../stores/configurator'
import { IconChevronUp, IconChevronDown } from '../icons'
import { CURRENCY } from '../pricing'

const store = useConfigurator()
const { totals } = storeToRefs(store)

const open = ref(false)
const areaM2 = computed(() => totals.value.areaM2.toFixed(2))
const perimM = computed(() => totals.value.perimM.toFixed(2))
const price = computed(() => totals.value.price.toFixed(0))
</script>

<template>
  <section :class="['sheet', { open }]">
    <button class="head" @click="open = !open">
      <span class="bar"></span>
      <span class="peek">
        <span>S <b>{{ areaM2 }}</b> м²</span>
        <span>P <b>{{ perimM }}</b> м</span>
        <span>Цена <b>{{ price }}</b> {{ CURRENCY }}</span>
      </span>
      <span class="chev">
        <component :is="open ? IconChevronDown : IconChevronUp" :size="16" :stroke-width="1.75" />
      </span>
    </button>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 6;
  display: flex; flex-direction: column;
  height: 82%;
  background: #10182a; border-top: 1px solid #2a3550;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.45);
  transform: translateY(calc(100% - 62px));
  transition: transform 0.22s ease;
}
.sheet.open { transform: translateY(0); }
.head {
  flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; height: 62px; box-sizing: border-box;
  padding: 0 12px; background: none; border: none; color: #cbd5e1; cursor: pointer;
  position: relative;
}
.bar { width: 38px; height: 4px; border-radius: 2px; background: #2a3550; }
.peek { display: flex; gap: 14px; font-size: 12px; color: #8fa3c4; }
.peek b { color: #e8eefc; font-size: 13px; }
.chev { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: flex; color: #55637f; }
.body { flex: 1; min-height: 0; overflow-y: auto; }
/* панель внутри шторки занимает всю ширину */
.body :deep(.panel) {
  width: 100%; flex: 1 1 auto; border-left: none; padding-bottom: 28px;
}
</style>
