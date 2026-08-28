import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { themeMode, setTheme, resolvedTheme, initTheme } from '../src/theme'
import SettingsDialog from '../src/components/SettingsDialog.vue'
import ProjectsPanel from '../src/components/ProjectsPanel.vue'

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  store = useConfigurator()
  localStorage.clear()
  setTheme('system')
  document.documentElement.removeAttribute('data-theme')
})

describe('тема', () => {
  it('системная разворачивается в тёмную или светлую', () => {
    expect(['dark', 'light']).toContain(resolvedTheme('system'))
    expect(resolvedTheme('light')).toBe('light')
    expect(resolvedTheme('dark')).toBe('dark')
  })

  it('выбор запоминается и попадает на корень документа', () => {
    initTheme()
    setTheme('light')
    expect(localStorage.getItem('nmr.theme')).toBe('light')
    // watch внутри initTheme отрабатывает асинхронно — проверяем через микрозадачу
    return Promise.resolve().then(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
    })
  })
})

describe('окно настроек', () => {
  const open = () => mount(SettingsDialog, { global: { plugins: [pinia] } })

  it('переключает тему и правит настройки чертежа', async () => {
    const w = open()
    const themes = w.findAll('.themes button')
    expect(themes.map((b) => b.text())).toEqual(['Как в системе', 'Тёмная', 'Светлая'])

    await themes[2].trigger('click')
    expect(themeMode.value).toBe('light')
    await w.vm.$nextTick()
    expect(w.findAll('.themes button.on')).toHaveLength(1)

    const grid = w.findAll('.row').find((r) => r.text().includes('Шаг сетки'))!.find('input')
    await grid.setValue('50')
    await grid.trigger('change')
    expect(store.settings.gridStep).toBe(50)
  })
})

describe('кнопка в списке проектов', () => {
  it('просит открыть настройки', async () => {
    const w = mount(ProjectsPanel, { global: { plugins: [pinia] } })
    const gear = w.findAll('button').find((b) => b.attributes('title') === 'Настройки')!
    await gear.trigger('click')
    expect(w.emitted('settings')).toHaveLength(1)
  })
})
