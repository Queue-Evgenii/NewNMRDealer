import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { cornerLabel, sideLabel } from '../src/labels'
import SidePanel from '../src/components/SidePanel.vue'

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  store = useConfigurator()
  localStorage.clear()
  store.insertRectangle(4000, 3000)
})

const panel = () => mount(SidePanel, { global: { plugins: [pinia] } })
/** Поле по подписи строки: «Длина, мм» → его input. */
function field(w: ReturnType<typeof panel>, label: string) {
  const row = w.findAll('.row').find((r) => r.text().includes(label))
  return row!.find('input')
}

describe('подписи углов', () => {
  it('идут буквами и уступают имени из мастера', () => {
    expect(cornerLabel(0)).toBe('А')
    expect(cornerLabel(1)).toBe('Б')
    expect(cornerLabel(27)).toBe('Я') // последняя буква набора
    expect(cornerLabel(28)).toBe('А2') // дальше — с номером
    expect(cornerLabel(1, 'у окна')).toBe('у окна')
    expect(sideLabel(0, 1)).toBe('АБ')
  })
})

describe('правка числами', () => {
  it('перечень сторон правит длины и выбирает сторону', async () => {
    const w = panel()
    const rows = w.findAll('.sides li')
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.find('.pick').text())).toEqual(['АБ', 'БВ', 'ВГ', 'ГА'])

    // ввод длины в строке «АБ» двигает именно эту сторону
    await rows[0].find('input').setValue('2500')
    await rows[0].find('input').trigger('change')
    const top = store.activeEdges[0]
    expect(top.length).toBeCloseTo(2500, 0)

    // строка выбирает сторону — на чертеже она подсвечивается
    await rows[2].find('.pick').trigger('click')
    expect(store.selectedEdgeKey).toBe(store.activeEdges[2].key)
    expect(w.text()).toContain('Сторона ВГ')
  })
  it('прогиб дуги задаётся полем', async () => {
    const top = store.activeEdges.find((e) => e.a.y === 0 && e.b.y === 0)!
    store.selectEdge(top.key)
    const w = panel()

    await field(w, 'Прогиб').setValue('300')
    await field(w, 'Прогиб').trigger('change')
    const after = store.activeEdges.find((e) => e.key === top.key)!
    expect((after.chord * Math.abs(after.props.bulge)) / 2).toBeCloseTo(300, 0)
  })

  it('угол назван буквой, показывает раствор и двигается координатами', async () => {
    const corner = store.activeShape.points[1] // «Б»
    store.selectPoint(corner.id)

    const w = panel()
    expect(w.text()).toContain('Угол Б')
    expect(w.text()).toContain('90°')

    await field(w, 'X, мм').setValue('4500')
    await field(w, 'X, мм').trigger('change')
    expect(store.activeShape.points[1].x).toBe(4500)

    await field(w, 'Y, мм').setValue('200')
    await field(w, 'Y, мм').trigger('change')
    expect(store.activeShape.points[1].y).toBe(200)
  })

  it('скругление угла задаётся радиусом в поле', async () => {
    const corner = store.activeShape.points[2]
    store.selectPoint(corner.id)
    const w = panel()

    await field(w, 'Скругление R').setValue('400')
    await w.findAll('button').find((b) => b.text() === 'Скруглить')!.trigger('click')

    expect(store.activeShape.points).toHaveLength(5)
    expect(store.activeEdges.some((e) => e.props.bulge !== 0)).toBe(true)
  })

  it('поля показываются только для выбранного, а не всегда', () => {
    store.clearSelection()
    const w = panel()
    expect(w.text()).not.toContain('Сторона')
    expect(w.text()).not.toContain('Угол ')
  })
})

describe('обмен чертежом', () => {
  it('панель отдаёт ссылку, экспорт и импорт', () => {
    const w = panel()
    const io = w.find('.io')
    expect(io.exists()).toBe(true)
    expect(io.findAll('button').map((b) => b.text())).toEqual(['Ссылка на чертёж', 'Экспорт JSON'])
    expect(io.find('input[type="file"]').exists()).toBe(true) // импорт — скрытый file
  })
})
