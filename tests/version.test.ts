import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  applyInfo, applyUpdate, checkVersion, compareVersions, markReady, setApply, setCurrentVersion, version,
} from '../src/version'
import UpdateGate from '../src/components/UpdateGate.vue'
import UpdateButton from '../src/components/UpdateButton.vue'

beforeEach(() => {
  Object.assign(version, {
    current: '1.2.0', latest: '1.2.0', minSupported: '1.2.0',
    available: false, ready: false, blocked: false,
  })
  setApply(() => {})
})

describe('версия сборки', () => {
  /** Её знает только сборщик — точка входа передаёт её в стор при старте. */
  it('приходит снаружи и сама себя не считает устаревшей', () => {
    setCurrentVersion('3.1.4')
    expect(version.current).toBe('3.1.4')
    expect(version.available).toBe(false)
    expect(version.blocked).toBe(false)
  })
})

describe('сравнение версий', () => {
  it('считает по числам, а не по строкам', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1) // строкой было бы наоборот
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
  })
})

describe('что делать с новой версией', () => {
  it('новее — предлагаем, не старше — молчим', () => {
    applyInfo({ version: '1.3.0', minSupported: '1.0.0' })
    expect(version.available).toBe(true)
    expect(version.blocked).toBe(false)

    applyInfo({ version: '1.2.0', minSupported: '1.0.0' })
    expect(version.available).toBe(false)
  })

  it('версия ниже минимальной — работать нельзя', () => {
    applyInfo({ version: '2.0.0', minSupported: '2.0.0' })
    expect(version.blocked).toBe(true)
    expect(version.available).toBe(true)
  })

  it('сервер недоступен — остаёмся на своей версии', async () => {
    await checkVersion(() => Promise.reject(new Error('offline')) as never)
    expect(version.available).toBe(false)
    expect(version.blocked).toBe(false)
  })

  it('спрашивает мимо кэша', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ version: '1.5.0', minSupported: '1.0.0' }),
    })
    await checkVersion(fetcher as never)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
    expect(version.latest).toBe('1.5.0')
  })
})

describe('приложение само не обновляется', () => {
  it('обновление применяется только по кнопке в шапке', async () => {
    const apply = vi.fn()
    setApply(apply)
    markReady() // воркер уже скачал новую сборку

    const w = mount(UpdateButton)
    expect(w.find('.update').exists()).toBe(true)
    expect(apply).not.toHaveBeenCalled() // само ничего не перезагрузилось

    await w.find('.update').trigger('click')
    expect(apply).toHaveBeenCalledOnce()
  })

  it('пока обновления нет — в шапке пусто', () => {
    expect(mount(UpdateButton).find('.update').exists()).toBe(false)
  })

  it('обязательное обновление закрывает экран: единственная кнопка — обновить', async () => {
    applyInfo({ version: '2.0.0', minSupported: '2.0.0' })
    const w = mount(UpdateGate)
    expect(w.find('.block').exists()).toBe(true)
    expect(w.findAll('.acts button').map((b) => b.text())).toEqual(['Обновить']) // отложить нечем

    const apply = vi.fn()
    setApply(apply)
    await w.find('.primary').trigger('click')
    expect(apply).toHaveBeenCalledOnce()
  })

  it('обычное обновление экран не закрывает', () => {
    applyInfo({ version: '1.3.0', minSupported: '1.0.0' })
    expect(mount(UpdateGate).find('.block').exists()).toBe(false)
    expect(mount(UpdateButton).find('.update').exists()).toBe(true)
  })

  it('без сервис-воркера обновление — обычная перезагрузка', async () => {
    setApply(null as never)
    // @ts-expect-error подменяем location.reload в jsdom
    delete window.location
    const reload = vi.fn()
    // @ts-expect-error минимальный location для теста
    window.location = { reload }
    await applyUpdate()
    expect(reload).toHaveBeenCalledOnce()
  })
})
