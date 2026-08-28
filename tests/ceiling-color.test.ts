import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { encodeModel, decodeModel } from '../src/composables/useShareLink'
import { BASIC_COLORS, DEFAULT_COLOR, hexToHsv, hsvToHex, normalizeHex } from '../src/ceilingColors'
import { DEFAULT_FILM } from '../src/filmColors'
import ColorDialog from '../src/components/ColorDialog.vue'
import ColorPicker from '../src/components/ColorPicker.vue'
import SidePanel from '../src/components/SidePanel.vue'
import type { SerializedModel } from '../src/types'

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  store = useConfigurator()
  localStorage.clear()
})

/** Второе полотно вторым ярусом: на ярусах и проверяем разные цвета. */
function secondLevel(): string {
  store.setTool('draw')
  for (const p of [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }]) store.drawPoint(p.x, p.y, false)
  store.finishDraw(true)
  const id = store.activeShapeId
  store.setShapeLevel(id, 2, 150)
  return id
}
const shapeOf = (id: string) => store.shapes.find((s) => s.id === id)!

describe('палитра', () => {
  it('каждый образец — корректный код цвета', () => {
    for (const c of BASIC_COLORS) {
      expect(normalizeHex(c.hex), `${c.name}: ${c.hex}`).toBe(c.hex)
      expect(c.name.trim().length).toBeGreaterThan(0)
    }
  })

  it('разбирает запись цвета в любом виде и отбрасывает мусор', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('  2f6fed ')).toBe('#2f6fed')
    expect(normalizeHex('синий')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
  })

  it('HSV и код цвета переводятся друг в друга без потерь', () => {
    for (const hex of ['#000000', '#ffffff', '#2f6fed', '#c8322f', '#3f8f5c', '#7b1f2b']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })
})

describe('цвет и плёнка полотна', () => {
  it('новое полотно — белый глянец', () => {
    expect(store.shapes[0].colorHex).toBe(DEFAULT_COLOR.hex)
    expect(store.shapes[0].film).toBe(DEFAULT_FILM)
  })

  it('у каждого яруса свой цвет', () => {
    const lower = secondLevel()
    store.setShapeColor(lower, '#c8322f')
    store.setShapeFilm(lower, 'Мат')
    expect(shapeOf(lower).colorHex).toBe('#c8322f')
    expect(shapeOf(lower).film).toBe('Мат')
    expect(store.shapes[0].colorHex).toBe(DEFAULT_COLOR.hex)
    expect(store.shapes[0].film).toBe(DEFAULT_FILM)
  })

  it('мусор вместо цвета или плёнки не проходит', () => {
    const id = store.shapes[0].id
    store.setShapeColor(id, '#c8322f')
    store.setShapeColor(id, 'вишня')
    store.setShapeFilm(id, 'Бархат')
    expect(shapeOf(id).colorHex).toBe('#c8322f')
    expect(shapeOf(id).film).toBe(DEFAULT_FILM)
  })

  it('переживает перезагрузку', () => {
    store.setShapeColor(store.shapes[0].id, '#2c5aa8')
    const saved = store.serialize()
    setActivePinia(createPinia())
    const fresh = useConfigurator()
    fresh.applySerialized(JSON.parse(saved) as SerializedModel)
    expect(fresh.shapes[0].colorHex).toBe('#2c5aa8')
  })

  it('едет в ссылке на чертёж', async () => {
    const lower = secondLevel()
    store.setShapeColor(lower, '#c8322f')
    store.setShapeFilm(lower, 'Мат')

    const restored = await decodeModel(await encodeModel(JSON.parse(store.serialize())))
    const back = restored!.shapes.find((s) => s.level === 2)!
    expect(back.colorHex).toBe('#c8322f')
    expect(back.film).toBe('Мат')
    expect(restored!.shapes.find((s) => s.level === 1)!.film).toBe(DEFAULT_FILM)
  })

  it('чертёж без этих полей открывается', () => {
    const model = JSON.parse(store.serialize()) as SerializedModel
    for (const s of model.shapes) {
      delete (s as { colorHex?: unknown }).colorHex
      delete (s as { film?: unknown }).film
    }
    store.applySerialized(model)
    expect(store.shapes[0].colorHex).toBe(DEFAULT_COLOR.hex)
    expect(store.shapes[0].film).toBe(DEFAULT_FILM)
  })
})

describe('пикер цвета', () => {
  const mountPicker = (v = '#2f6fed') => mount(ColorPicker, { props: { modelValue: v } })

  it('работает без нативного input[type=color]', () => {
    const w = mountPicker()
    expect(w.find('input[type="color"]').exists()).toBe(false)
    expect(w.find('.area').exists()).toBe(true)
    expect(w.find('.hue').exists()).toBe(true)
  })

  it('принимает код цвета руками', async () => {
    const w = mountPicker()
    await w.find('.hex').setValue('#123456')
    expect(w.emitted('update:modelValue')?.flat()).toContain('#123456')
  })

  it('стрелками двигает насыщенность и оттенок', async () => {
    const w = mountPicker('#808080')
    await w.find('.area').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')!.at(-1)![0]).not.toBe('#808080')
    await w.find('.hue').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')!.length).toBe(2)
  })
})

describe('окно выбора', () => {
  const open = (id: string) => mount(ColorDialog, { props: { shapeId: id }, global: { plugins: [pinia] } })

  it('образец и плёнка применяются к своему полотну', async () => {
    const lower = secondLevel()
    const w = open(lower)
    await w.findAll('.cell')[16].trigger('click')
    await w.findAll('.films button')[1].trigger('click')
    expect(shapeOf(lower).colorHex).toBe(BASIC_COLORS[16].hex)
    expect(shapeOf(lower).film).toBe('Мат')
    expect(store.shapes[0].colorHex).toBe(DEFAULT_COLOR.hex)
  })
})

describe('боковая панель', () => {
  it('цвет задаётся ровно в одном месте', async () => {
    const w = mount(SidePanel, { global: { plugins: [pinia] } })
    const fields = w.findAll('.color-field')
    expect(fields).toHaveLength(1)
    await fields[0].trigger('click')
    expect(w.emitted('color')).toHaveLength(1)
    expect(w.findComponent(ColorDialog).exists()).toBe(false) // окно рисует рабочая область
  })
})

describe('пикер прячется за кнопку', () => {
  it('открывается только по нажатию «Свой оттенок»', async () => {
    const w = mount(ColorDialog, {
      props: { shapeId: store.activeShapeId }, global: { plugins: [pinia] },
    })
    expect(w.findComponent(ColorPicker).exists()).toBe(false)
    await w.find('.more').trigger('click')
    expect(w.findComponent(ColorPicker).exists()).toBe(true)
    await w.find('.more').trigger('click')
    expect(w.findComponent(ColorPicker).exists()).toBe(false)
  })
})

describe('незамкнутый контур', () => {
  it('панель предупреждает и предлагает замкнуть', async () => {
    store.reset('empty')
    store.setTool('draw')
    for (const p of [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1500 }]) store.drawPoint(p.x, p.y, false)
    store.finishDraw(false) // «Готово» без замыкания

    const w = mount(SidePanel, { global: { plugins: [pinia] } })
    expect(w.findAll('.warn')).toHaveLength(2) // в итогах и у выбранного полотна
    expect(store.totals.areaM2).toBe(0)

    await w.findAll('button').find((b) => b.text() === 'Замкнуть контур')!.trigger('click')
    expect(store.activeShape.closed).toBe(true)
    expect(store.totals.areaM2).toBeGreaterThan(0)
  })
})

describe('вырез вне полотна', () => {
  it('нельзя поставить, а уже стоящий объясняет нулевые цифры', async () => {
    store.reset('empty')
    store.setTool('draw')
    for (const p of [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }]) {
      store.drawPoint(p.x, p.y, false)
    }
    store.finishDraw(true)

    // единственный контур не лежит ни в чём — «Вырез» недоступен
    expect(store.hostOfActive).toBeNull()
    const w = mount(SidePanel, { global: { plugins: [pinia] } })
    const hole = w.findAll('.seg button').find((b) => b.text() === 'Вырез')!
    expect(hole.attributes('disabled')).toBeDefined()

    // а если вырез всё же остался с прошлых правок — панель говорит, почему ноль
    store.setShapeKind(store.activeShapeId, 'hole')
    await w.vm.$nextTick()
    expect(store.totals.areaM2).toBe(0)
    expect(w.text()).toContain('не лежит внутри полотна')
  })
})

describe('перепад яруса', () => {
  it('поле появляется со второго яруса и опускает полотно', async () => {
    const lower = secondLevel()
    store.setShapeDrop(lower, 0)
    const w = mount(SidePanel, { global: { plugins: [pinia] } })

    const field = w.findAll('.row').find((r) => r.text().includes('Перепад'))!
    expect(field).toBeTruthy()

    await field.find('input').setValue('150')
    await field.find('input').trigger('change')
    expect(shapeOf(lower).drop).toBe(150)

    // на первом ярусе перепада нет — он и есть точка отсчёта
    store.setActiveShape(store.shapes[0].id)
    await w.vm.$nextTick()
    expect(w.findAll('.row').some((r) => r.text().includes('Перепад'))).toBe(false)
  })

  it('смена яруса сама полотно не опускает', () => {
    const lower = secondLevel()
    store.setShapeDrop(lower, 0)
    store.setShapeLevel(lower, 3)
    expect(shapeOf(lower).drop).toBe(0)
  })
})

describe('вырез', () => {
  it('без цвета, яруса и цифр — он живёт настройками полотна', async () => {
    store.reset('empty')
    store.setTool('draw')
    for (const p of [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }]) {
      store.drawPoint(p.x, p.y, false)
    }
    store.finishDraw(true)
    store.setTool('draw')
    for (const p of [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 1000, y: 2000 }]) {
      store.drawPoint(p.x, p.y, false)
    }
    store.finishDraw(true)
    const hole = store.activeShapeId

    const w = mount(SidePanel, { global: { plugins: [pinia] } })
    expect(w.findAll('.color-field')).toHaveLength(1)
    expect(w.findAll('.row').some((r) => r.text().includes('Ярус'))).toBe(true)

    store.setShapeKind(hole, 'hole')
    await w.vm.$nextTick()
    expect(w.findAll('.color-field')).toHaveLength(0)
    expect(w.findAll('.row').some((r) => r.text().includes('Ярус'))).toBe(false)
  })
})
