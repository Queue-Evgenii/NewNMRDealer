import { onMounted, onBeforeUnmount } from 'vue'
import { useConfigurator } from '../stores/configurator'

/**
 * Горячие клавиши.
 *
 * Смотрим на `event.code` — физическую клавишу, а не на `event.key`. В русской
 * раскладке та же клавиша даёт «я» вместо «z», и сравнение по символу молча
 * ломало всё: ни Ctrl+Z, ни переключение режимов не работали.
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
    const code = e.code

    if (ctrl && code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); store.undo(); return }
    if (ctrl && (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); store.redo(); return }
    if (ctrl) return // остальные сочетания оставляем браузеру

    // режим «Рисовать» перехватывает подтверждение и откат точки
    if (store.tool === 'draw') {
      if (code === 'Enter' || code === 'NumpadEnter') { e.preventDefault(); store.finishDraw(true); return }
      if (code === 'Backspace') { e.preventDefault(); store.undoDrawPoint(); return }
      if (code === 'Escape') { e.preventDefault(); store.finishDraw(false); return }
    }

    const levelsShown = () => store.levelStats.filter((l) => l.visible).length

    switch (code) {
      case 'Delete':
      case 'Backspace': e.preventDefault(); store.deleteSelected(); break
      case 'Escape': store.clearSelection(); break
      case 'KeyV': store.setTool('select'); break
      case 'KeyD':
      case 'KeyP': store.setTool('draw'); break
      case 'KeyR': store.setTool('ruler'); break
      case 'KeyT': store.setTool('measure'); break
      case 'KeyG': store.updateSettings({ showGrid: !store.settings.showGrid }); break
      case 'KeyM': store.updateSettings({ showMeasures: !store.settings.showMeasures }); break
      case 'KeyS': store.updateSettings({ snap: !store.settings.snap }); break
      case 'KeyC': if (!store.activeShape.triangles.length) store.toggleClosed(); break
      // разбор потолка по слоям
      case 'BracketLeft': store.showUpToLevel(levelsShown() - 1); break
      case 'BracketRight': store.showUpToLevel(levelsShown() + 1); break
      case 'Backslash': store.showAllLevels(); break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
