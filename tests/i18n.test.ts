import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguagePicker from '../src/components/LanguagePicker.vue'
import { i18n, LOCALES, LOCALE_NAMES, setLocale, currentLocale } from '../src/i18n'
import ru from '../src/i18n/locales/ru'
import pl from '../src/i18n/locales/pl'
import en from '../src/i18n/locales/en'
import { BASIC_COLORS } from '../src/ceilingColors'
import { FILMS, LEGACY_FILMS, filmLabel } from '../src/filmColors'
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
})
