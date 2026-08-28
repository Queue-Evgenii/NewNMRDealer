import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import fs from 'node:fs'
import path from 'node:path'
import Toolbar from '../src/components/Toolbar.vue'
import ModeSwitch from '../src/components/ModeSwitch.vue'
import { useConfigurator } from '../src/stores/configurator'

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  localStorage.clear()
})

const mountWith = (c: unknown) => mount(c as never, { global: { plugins: [pinia] } })

/**
 * Панель инструментов должна выглядеть как одна система, а не как набор
 * кнопок разного размера. Гарантия структурная: каждая кнопка — либо плитка
 * .tile фиксированного размера, либо одна из двух общих кнопок .btn-*.
 */
describe('панель инструментов', () => {
  it('состоит только из общих классов кнопок', () => {
    const w = mountWith(Toolbar)
    const buttons = w.findAll('button')
    expect(buttons.length).toBeGreaterThan(10)
    for (const b of buttons) {
      const cls = b.classes()
      const known = cls.includes('tile') || cls.includes('btn-primary') || cls.includes('btn-ghost')
      expect(known, `кнопка «${b.text() || b.attributes('title')}» вне общей сетки: ${cls.join('.')}`).toBe(true)
    }
  })

  it('каждая плитка — иконка плюс подпись', () => {
    const w = mountWith(Toolbar)
    const tiles = w.findAll('.tile')
    expect(tiles.length).toBeGreaterThanOrEqual(14)
    for (const t of tiles) {
      expect(t.find('svg').exists(), `плитка «${t.text()}» без иконки`).toBe(true)
      expect(t.find('span').exists(), 'плитка без подписи').toBe(true)
      expect(t.text().length, 'подпись плитки пустая').toBeGreaterThan(2)
    }
  })

  it('группирует кнопки: режимы, действия, вид', () => {
    const w = mountWith(Toolbar)
    expect(w.findAll('.tool-group')).toHaveLength(3)
  })

  it('тумблеры вида и режимы различаются состоянием, а не размером', () => {
    const w = mountWith(Toolbar)
    const store = useConfigurator()
    // включённые тумблеры помечены .toggle.on — приглушённая подсветка
    const toggles = w.findAll('.tile.toggle')
    expect(toggles.length).toBeGreaterThan(0)
    expect(w.findAll('.tile.toggle.on').length).toBe(
      [store.settings.showGrid, store.settings.showMeasures, store.settings.showTriangles,
        store.settings.snap, store.activeShape.closed].filter(Boolean).length,
    )
  })
})

describe('переключатель режимов', () => {
  it('показывает четыре режима и переключает инструмент', async () => {
    const w = mountWith(ModeSwitch)
    const store = useConfigurator()
    const tiles = w.findAll('.tile')
    expect(tiles).toHaveLength(4)
    expect(w.text()).toContain('Выбор')
    expect(w.text()).toContain('Замер')

    expect(store.tool).toBe('select')
    await tiles[1].trigger('click')
    expect(store.tool).toBe('draw')
    await tiles[3].trigger('click')
    expect(store.tool).toBe('measure')
    expect(w.findAll('.tile.on')).toHaveLength(1) // активен ровно один
  })
})

/**
 * Эмодзи в интерфейсе цветные и рисуются шрифтом системы — рядом со
 * штриховыми иконками это выглядит как разнобой. Иконки берём только из
 * src/icons.ts.
 */
describe('иконки', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

  function walk(dir: string, out: string[] = []): string[] {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) walk(p, out)
      else if (f.name.endsWith('.vue')) out.push(p)
    }
    return out
  }

  it('в разметке не осталось эмодзи', () => {
    const bad: string[] = []
    for (const file of walk('src')) {
      const text = fs.readFileSync(file, 'utf8')
      for (const [i, line] of text.split('\n').entries()) {
        const hit = line.match(EMOJI)
        if (hit) bad.push(`${path.relative('src', file)}:${i + 1} → ${hit[0]}`)
      }
    }
    expect(bad, 'замените на иконку из src/icons.ts').toEqual([])
  })

  it('набор иконок собран в одном месте', () => {
    const files = walk('src').filter((f) => fs.readFileSync(f, 'utf8').includes('lucide-vue-next'))
    expect(files, 'иконки импортируются напрямую из lucide, минуя src/icons.ts').toEqual([])
  })
})

/**
 * Системные confirm/alert нельзя оформить, они блокируют вкладку и в
 * мобильном вебвью выглядят чужеродно — спрашиваем своим диалогом.
 */
describe('свои диалоги вместо системных', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) walk(p, out)
      else if (f.name.endsWith('.vue') || f.name.endsWith('.ts')) out.push(p)
    }
    return out
  }

  it('в коде нет confirm() и alert()', () => {
    const bad: string[] = []
    for (const file of walk('src')) {
      const text = fs.readFileSync(file, 'utf8')
      for (const [i, line] of text.split('\n').entries()) {
        // без комментариев (\r в конце строки CRLF мешает якорю $)
        const code = line.replace(/\r/g, '').replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        if (/(^|[^.\w])(confirm|alert)\s*\(/.test(code)) {
          bad.push(`${path.relative('src', file)}:${i + 1}`)
        }
      }
    }
    expect(bad, 'спрашивайте через ConfirmDialog.vue').toEqual([])
  })
})
