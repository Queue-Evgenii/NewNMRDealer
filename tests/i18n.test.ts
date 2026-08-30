import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import LanguagePicker from '../src/components/LanguagePicker.vue'
import { i18n, LOCALES, LOCALE_NAMES, setLocale, currentLocale } from '../src/i18n'
import ru from '../src/i18n/locales/ru'
import pl from '../src/i18n/locales/pl'
import en from '../src/i18n/locales/en'
import { BASIC_COLORS } from '../src/ceilingColors'
import { DEFAULT_FILM, FILMS, LEGACY_FILMS, filmLabel } from '../src/filmColors'
import { FILM_PER_M2 } from '../src/pricing'

/** Все ключи словаря плоским списком: `panel.area`, `color.names.white`… */
function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null ? keysOf(v as Record<string, unknown>, path) : [path]
  })
}

afterEach(() => setLocale('ru'))

describe('словари', () => {
  it('русский — по умолчанию', () => {
    expect(currentLocale()).toBe('ru')
  })

  it('в польском и английском те же ключи, что в русском', () => {
    const base = keysOf(ru).sort()
    expect(keysOf(pl).sort()).toEqual(base)
    expect(keysOf(en).sort()).toEqual(base)
  })

  it('ни одна подпись не пустая', () => {
    for (const [name, dict] of Object.entries({ ru, pl, en })) {
      for (const key of keysOf(dict)) {
        const value = key.split('.').reduce<any>((o, k) => o[k], dict)
        expect(String(value).trim().length, `${name}: ${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('множественное в русском и польском различает 1, 2 и 5', () => {
    const forms = (locale: 'ru' | 'pl') => {
      setLocale(locale)
      return [1, 2, 5].map((n) => i18n.global.t('panel.shareCopied', { n }, n))
    }
    for (const locale of ['ru', 'pl'] as const) {
      const [one, few, many] = forms(locale)
      expect(new Set([one, few, many]).size, locale).toBe(3)
    }
  })
})

describe('выбор языка', () => {
  it('список открывается, флаг есть у каждого языка, выбор переключает интерфейс', async () => {
    const w = mount(LanguagePicker)
    expect(w.find('.list').exists()).toBe(false) // закрыт, пока не нажали

    await w.find('.current').trigger('click')
    const rows = w.findAll('.list li')
    expect(rows).toHaveLength(LOCALES.length)
    expect(rows.map((r) => r.find('.name').text())).toEqual(LOCALES.map((l) => LOCALE_NAMES[l]))
    expect(rows.every((r) => r.find('img.flag').attributes('src')?.endsWith('.svg'))).toBe(true)

    await rows[LOCALES.indexOf('pl')].trigger('click')
    expect(currentLocale()).toBe('pl')
    expect(w.find('.list').exists()).toBe(false) // выбрали — список закрылся
    expect(w.find('.current .name').text()).toBe(LOCALE_NAMES.pl)
  })

  it('в списке ровно одна отметка — на текущем языке', async () => {
    setLocale('en')
    const w = mount(LanguagePicker)
    await w.find('.current').trigger('click')
    expect(w.findAll('.list li.on')).toHaveLength(1)
    expect(w.find('.list li.on .name').text()).toBe(LOCALE_NAMES.en)
  })
})

describe('доменные значения не переводятся', () => {
  it('плёнка и цвет хранятся идентификаторами, подпись берётся по ним', () => {
    for (const film of FILMS) {
      expect(film).toMatch(/^[a-z]+$/)
      expect(FILM_PER_M2[film]).toBeGreaterThan(0)
      for (const locale of LOCALES) {
        setLocale(locale)
        expect(filmLabel(film).trim().length, `${locale}: ${film}`).toBeGreaterThan(0)
      }
    }
    for (const c of BASIC_COLORS) expect(c.id).toMatch(/^[a-zA-Z]+$/)
  })

  it('старые названия плёнки переносятся на идентификаторы', () => {
    expect(Object.values(LEGACY_FILMS).sort()).toEqual([...FILMS].sort())
    expect(LEGACY_FILMS['Глянец']).toBe('gloss')
  })

  /**
   * Главный риск перевода: чертёж, сохранённый до v3, держит плёнку русским
   * названием — а по нему берётся ставка. Не перенеси мы его, цена молча
   * съехала бы на дефолтный глянец.
   */
  it('чертёж v2 открывается с той же плёнкой и той же ценой', () => {
    setActivePinia(createPinia())
    const store = useConfigurator()
    localStorage.clear()
    store.reset('empty')

    store.setTool('draw')
    for (const p of [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }]) {
      store.drawPoint(p.x, p.y, false)
    }
    store.finishDraw(true)
    store.setShapeFilm(store.activeShapeId, 'mat')
    const priceNow = store.totals.price

    // как это лежало в localStorage у пользователя старой сборки
    const v2 = JSON.parse(store.serialize())
    v2.version = 2
    for (const s of v2.shapes) s.film = 'Мат'

    setActivePinia(createPinia())
    const opened = useConfigurator()
    opened.applySerialized(v2)

    expect(opened.shapes[0].film).toBe('mat')
    expect(opened.totals.price).toBeCloseTo(priceNow, 3)
  })

  it('плёнку, которой нет ни в новых, ни в старых, заменяет плёнка по умолчанию', () => {
    setActivePinia(createPinia())
    const store = useConfigurator()
    store.reset('rect')
    const model = JSON.parse(store.serialize())
    for (const s of model.shapes) s.film = 'Бархат'
    store.applySerialized(model)
    expect(store.shapes[0].film).toBe(DEFAULT_FILM)
  })
})
