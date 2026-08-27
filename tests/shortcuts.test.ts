import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { useShortcuts } from '../src/composables/useShortcuts'

let store: ReturnType<typeof useConfigurator>
let host: ReturnType<typeof mount>

const Host = defineComponent({
  setup() { useShortcuts() },
  template: '<div><input class="field" /></div>',
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  store = useConfigurator()
  host = mount(Host)
})
afterEach(() => host.unmount())

/** Нажатие физической клавиши: key — то, что даёт раскладка, code — сама клавиша. */
function press(code: string, key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, ...opts }))
}

/**
 * Клавиши читаются по физической клавише (`code`). Сравнение по символу
 * ломалось на русской раскладке: Ctrl+Z там приходит как «я».
 */
describe('горячие клавиши', () => {
  it('Ctrl+Z откатывает и в английской, и в русской раскладке', () => {
    store.insertRectangle(3000, 2000)
    store.addRectangle(1000, 1000)
    expect(store.shapes).toHaveLength(2)

    press('KeyZ', 'z', { ctrlKey: true })
    expect(store.shapes).toHaveLength(1)

    store.addRectangle(1000, 1000)
    expect(store.shapes).toHaveLength(2)
    press('KeyZ', 'я', { ctrlKey: true }) // та же клавиша, русская раскладка
    expect(store.shapes, 'русская раскладка не должна ломать откат').toHaveLength(1)
  })

  it('Ctrl+Y и Ctrl+Shift+Z повторяют', () => {
    store.insertRectangle(3000, 2000)
    store.addRectangle(1000, 1000)
    press('KeyZ', 'я', { ctrlKey: true })
    expect(store.shapes).toHaveLength(1)

    press('KeyY', 'н', { ctrlKey: true }) // русская «н» на клавише Y
    expect(store.shapes).toHaveLength(2)

    press('KeyZ', 'я', { ctrlKey: true })
    press('KeyZ', 'Я', { ctrlKey: true, shiftKey: true })
    expect(store.shapes).toHaveLength(2)
  })

  it('режимы переключаются по физической клавише', () => {
    press('KeyD', 'в') // русская «в» на клавише D
    expect(store.tool).toBe('draw')
    press('KeyR', 'к')
    expect(store.tool).toBe('ruler')
    press('KeyT', 'е')
    expect(store.tool).toBe('measure')
    press('KeyV', 'м')
    expect(store.tool).toBe('select')
  })

  it('тумблеры вида тоже не зависят от раскладки', () => {
    const grid = store.settings.showGrid
    press('KeyG', 'п')
    expect(store.settings.showGrid).toBe(!grid)
    const snap = store.settings.snap
    press('KeyS', 'ы')
    expect(store.settings.snap).toBe(!snap)
  })

  it('пока курсор в поле ввода, клавиши не срабатывают', () => {
    store.insertRectangle(3000, 2000)
    store.addRectangle(1000, 1000)
    const input = host.find('.field').element as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true,
    }))
    expect(store.shapes, 'в поле ввода Ctrl+Z должен править текст').toHaveLength(2)
  })
})
