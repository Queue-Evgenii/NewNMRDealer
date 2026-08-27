import { acceptHMRUpdate, defineStore } from 'pinia'
import { newId } from '../composables/useGeometry'
import { setStorageKey, useConfigurator } from './configurator'

/**
 * Проекты — это отдельные чертежи. Каждый живёт в своём ключе хранилища,
 * а список держит только карточку: имя, дату и площадь для показа в боковой
 * панели. Переключение проекта = сохранить текущий и загрузить другой.
 */
export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Площадь полотна, м² — чтобы список был информативным без загрузки чертежа. */
  areaM2: number
  /** Клиент из карточки заказа, если указан. */
  client: string
}

const LIST_KEY = 'nmr.projects.v1'
/** Ключ, под которым чертёж лежал до появления проектов. */
const LEGACY_KEY = 'nmr.configurator.v2'
const projectKey = (id: string) => `nmr.project.${id}`

interface State {
  list: ProjectMeta[]
  currentId: string
  ready: boolean
  /**
   * Слепок чертежа на момент последней отметки. Переключение проекта тоже
   * меняет состояние конструктора, и без сравнения слепков дата «изменён»
   * обновлялась от простого открытия — хотя ничего не правили.
   */
  snapshot: string
}

/**
 * Список и то, какой проект был открыт. Открытый храним явно: по времени
 * правки его не угадать — у двух проектов метка может совпасть до миллисекунды.
 */
function readStore(): { list: ProjectMeta[]; currentId: string } {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    const data = raw ? JSON.parse(raw) : null
    if (Array.isArray(data)) return { list: data, currentId: '' } // старый формат
    if (data && Array.isArray(data.list)) return { list: data.list, currentId: data.currentId ?? '' }
  } catch { /* ignore */ }
  return { list: [], currentId: '' }
}

export const useProjects = defineStore('projects', {
  state: (): State => ({ list: [], currentId: '', ready: false, snapshot: '' }),

  getters: {
    current(state): ProjectMeta | null {
      return state.list.find((p) => p.id === state.currentId) ?? null
    },
    /** Сначала те, что правили недавно. */
    ordered(state): ProjectMeta[] {
      return [...state.list].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    },
  },

  actions: {
    /**
     * Поднимает список и открывает последний проект. Если проектов ещё нет,
     * заводит первый — и подхватывает в него чертёж, сделанный до появления
     * проектов, чтобы работа не пропала.
     */
    init() {
      if (this.ready) return
      const saved = readStore()
      this.list = saved.list
      this.currentId = saved.currentId

      if (!this.list.length) {
        const legacy = (() => {
          try { return localStorage.getItem(LEGACY_KEY) } catch { return null }
        })()
        const meta = this._newMeta(legacy ? 'Мой чертёж' : 'Проект 1')
        if (legacy) {
          try { localStorage.setItem(projectKey(meta.id), legacy) } catch { /* ignore */ }
        }
        this.list = [meta]
        this.currentId = meta.id
        this._saveList()
      } else {
        const last = this.ordered[0]
        this.currentId = this.list.some((p) => p.id === this.currentId) ? this.currentId : last.id
      }

      setStorageKey(projectKey(this.currentId))
      const cfg = useConfigurator()
      cfg.load()
      this._watch()
      this.ready = true
      this._refresh() // открытие — не правка: дату не трогаем
    },

    /** Новый пустой проект и сразу переход в него. */
    create(name?: string) {
      const cfg = useConfigurator()
      cfg.persist() // текущий чертёж дописываем в его проект

      const meta = this._newMeta(name || this._nextName())
      this.list.push(meta)
      this.currentId = meta.id
      setStorageKey(projectKey(meta.id))
      cfg.$reset()
      cfg.persist()
      this._refresh(meta)
      return meta.id
    },

    /** Переключиться на другой проект. */
    open(id: string) {
      if (id === this.currentId) return
      const meta = this.list.find((p) => p.id === id)
      if (!meta) return
      const cfg = useConfigurator()
      cfg.persist()
      setStorageKey(projectKey(id))
      this.currentId = id
      cfg.$reset()
      cfg.load()
      this._refresh(meta) // переключение — не правка
    },

    rename(id: string, name: string) {
      const meta = this.list.find((p) => p.id === id)
      if (!meta) return
      meta.name = name.trim() || meta.name
      meta.updatedAt = this._stamp()
      this._saveList()
    },

    /** Копия проекта вместе с чертежом — удобно для похожих объектов. */
    duplicate(id: string) {
      const src = this.list.find((p) => p.id === id)
      if (!src) return
      if (id === this.currentId) useConfigurator().persist()
      const meta = this._newMeta(`${src.name} — копия`)
      meta.areaM2 = src.areaM2
      meta.client = src.client
      try {
        const data = localStorage.getItem(projectKey(id))
        if (data) localStorage.setItem(projectKey(meta.id), data)
      } catch { /* ignore */ }
      this.list.push(meta)
      this._saveList()
      return meta.id
    },

    remove(id: string) {
      const idx = this.list.findIndex((p) => p.id === id)
      if (idx < 0) return
      this.list.splice(idx, 1)
      try { localStorage.removeItem(projectKey(id)) } catch { /* ignore */ }

      if (!this.list.length) {
        // последний проект удалять некуда — заводим чистый
        const meta = this._newMeta('Проект 1')
        this.list = [meta]
        this.currentId = meta.id
        setStorageKey(projectKey(meta.id))
        const cfg = useConfigurator()
        cfg.$reset()
        cfg.persist()
      } else if (id === this.currentId) {
        const next = this.ordered[0]
        this.currentId = next.id
        setStorageKey(projectKey(next.id))
        const cfg = useConfigurator()
        cfg.$reset()
        cfg.load()
        this._refresh(next)
      }
      this._saveList()
    },

    /** Отмечает правку: дата, площадь, клиент. */
    touch() {
      const meta = this.list.find((p) => p.id === this.currentId)
      if (!meta) return
      meta.updatedAt = this._stamp()
      this._refresh(meta)
    },
    /** Освежает цифры карточки, НЕ трогая дату — после загрузки проекта. */
    _refresh(meta?: ProjectMeta) {
      const m = meta ?? this.list.find((p) => p.id === this.currentId)
      if (!m) return
      const cfg = useConfigurator()
      m.areaM2 = cfg.area / 1_000_000
      m.client = cfg.order.client
      this.snapshot = cfg.serialize()
      this._saveList()
    },

    // ---- внутреннее ------------------------------------------------------
    /**
     * Метка «правили только что». Строго больше всех прочих: Date.now() имеет
     * разрешение в миллисекунду, и два действия подряд получали одно время —
     * список тогда переставал слушаться порядка работы.
     */
    _stamp(): number {
      const max = this.list.reduce((m, p) => Math.max(m, p.updatedAt), 0)
      return Math.max(Date.now(), max + 1)
    },
    _newMeta(name: string): ProjectMeta {
      const now = Date.now()
      return { id: newId(), name, createdAt: now, updatedAt: this._stamp(), areaM2: 0, client: '' }
    },
    _nextName(): string {
      let n = this.list.length + 1
      const taken = new Set(this.list.map((p) => p.name))
      while (taken.has(`Проект ${n}`)) n += 1
      return `Проект ${n}`
    },
    _saveList() {
      try {
        localStorage.setItem(LIST_KEY, JSON.stringify({ list: this.list, currentId: this.currentId }))
      } catch { /* ignore */ }
    },
    /**
     * Карточка обновляется сама — но только если чертёж реально другой.
     * Сравниваем со слепком: открытие проекта тоже дёргает конструктор,
     * и без этой проверки дата «изменён» врала.
     */
    _watch() {
      const cfg = useConfigurator()
      let timer = 0
      cfg.$subscribe(() => {
        clearTimeout(timer)
        timer = window.setTimeout(() => {
          const now = cfg.serialize()
          if (now === this.snapshot) return
          this.snapshot = now
          this.touch()
        }, 600)
      })
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProjects, import.meta.hot))
}
