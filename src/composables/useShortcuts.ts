import { onMounted, onBeforeUnmount } from 'vue'
import { useConfigurator } from '../stores/configurator'

/** Global keyboard shortcuts. Ignored while typing in a field. */
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
    if (ctrl) return // leave other ctrl combos to the browser

    switch (k) {
      case 'delete':
      case 'backspace': e.preventDefault(); store.deleteSelected(); break
      case 'v': store.setTool('select'); break
      case 'a': store.setTool('add'); break
      case 'r': store.setTool('ruler'); break
      case 'h': store.setTool('pan'); break
      case 'g': store.updateSettings({ showGrid: !store.settings.showGrid }); break
      case 'm': store.updateSettings({ showMeasures: !store.settings.showMeasures }); break
      case 'c': store.toggleClosed(); break
      case 'escape': store.selectPoint(null); store.selectEdge(null); break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
