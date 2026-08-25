import { onMounted, onBeforeUnmount } from 'vue'
import { useConfigurator } from '../stores/configurator'

/**
 * Горячие клавиши. Раскладка как в редакторах: буква — режим, Esc — выход,
 * Enter — подтвердить. Игнорируются, пока курсор в поле ввода.
 */
export function useShortcuts() {
  const store = useConfigurator()

  function isTyping(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  function onKey(e: KeyboardEvent) {
    if (isTyping(e.target)) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()

    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return }
    if (ctrl) return

    // режим «Рисовать» перехватывает подтверждение и откат точки
    if (store.tool === 'draw') {
      if (k === 'enter') { e.preventDefault(); store.finishDraw(true); return }
      if (k === 'backspace') { e.preventDefault(); store.undoDrawPoint(); return }
      if (k === 'escape') { e.preventDefault(); store.finishDraw(false); return }
    }

    switch (k) {
      case 'delete':
      case 'backspace': e.preventDefault(); store.deleteSelected(); break
      case 'escape': store.clearSelection(); break
      case 'v': store.setTool('select'); break
      case 'd':
      case 'p': store.setTool('draw'); break
      case 'r': store.setTool('ruler'); break
      case 't': store.setTool('measure'); break
      case 'g': store.updateSettings({ showGrid: !store.settings.showGrid }); break
      case 'm': store.updateSettings({ showMeasures: !store.settings.showMeasures }); break
      case 's': store.updateSettings({ snap: !store.settings.snap }); break
      case 'c': if (!store.activeShape.triangles.length) store.toggleClosed(); break
      // разбор потолка по слоям
      case '[': store.showUpToLevel(store.levelStats.filter((l) => l.visible).length - 1); break
      case ']': store.showUpToLevel(store.levelStats.filter((l) => l.visible).length + 1); break
      case '\\': store.showAllLevels(); break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
