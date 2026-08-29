import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import { useProjects } from '../src/stores/projects'

let cfg: ReturnType<typeof useConfigurator>
let projects: ReturnType<typeof useProjects>

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  cfg = useConfigurator()
  projects = useProjects()
})

/** Заново поднимает приложение на том же хранилище — как перезагрузка страницы. */
function reload() {
  setActivePinia(createPinia())
  cfg = useConfigurator()
  projects = useProjects()
  projects.init()
}

describe('проекты', () => {
  it('первый запуск заводит проект сам', () => {
    projects.init()
    expect(projects.list).toHaveLength(1)
    expect(projects.current?.name).toBe('Проект 1')
    expect(projects.currentId).toBe(projects.list[0].id)
  })

  it('подхватывает чертёж, сделанный до появления проектов', () => {
    // старое сохранение в прежнем ключе
    cfg.insertRectangle(4000, 3000)
    localStorage.setItem('nmr.configurator.v2', cfg.serialize())
    localStorage.removeItem('nmr.projects.v1')

    reload()
    expect(projects.list).toHaveLength(1)
    expect(projects.current?.name).toBe('Мой чертёж')
    expect(cfg.area / 1e6).toBeCloseTo(12, 3) // работа не пропала
  })

  it('новый проект открывается пустым, а прежний чертёж остаётся в своём', () => {
    projects.init()
    cfg.insertRectangle(4000, 3000)
    const first = projects.currentId

    const second = projects.create('Кухня')
    expect(projects.list).toHaveLength(2)
    expect(projects.current?.name).toBe('Кухня')
    cfg.insertRectangle(2000, 1000)
    expect(cfg.area / 1e6).toBeCloseTo(2, 3)

    projects.open(first)
    expect(cfg.area / 1e6).toBeCloseTo(12, 3) // вернулись к первому чертежу
    projects.open(second)
    expect(cfg.area / 1e6).toBeCloseTo(2, 3)
  })

  it('карточка проекта показывает площадь и клиента', () => {
    projects.init()
    cfg.insertRectangle(4000, 3000)
    cfg.updateOrder({ client: 'Иванов' })
    projects.touch()
    expect(projects.current?.areaM2).toBeCloseTo(12, 2)
    expect(projects.current?.client).toBe('Иванов')
  })

  it('переживает перезагрузку: список и текущий чертёж на месте', () => {
    projects.init()
    cfg.insertRectangle(4000, 3000)
    projects.create('Зал')
    cfg.insertRectangle(5000, 2000)
    const names = projects.list.map((p) => p.name).sort()

    reload()
    expect(projects.list.map((p) => p.name).sort()).toEqual(names)
    expect(projects.current?.name).toBe('Зал')
    expect(cfg.area / 1e6).toBeCloseTo(10, 3)
  })

  it('переименование и дубликат', () => {
    projects.init()
    cfg.insertRectangle(4000, 3000)
    projects.rename(projects.currentId, 'Ремонт у Петрова')
    expect(projects.current?.name).toBe('Ремонт у Петрова')

    const copyId = projects.duplicate(projects.currentId)!
    expect(projects.list).toHaveLength(2)
    projects.open(copyId)
    expect(projects.current?.name).toBe('Ремонт у Петрова — копия')
    expect(cfg.area / 1e6).toBeCloseTo(12, 3) // чертёж скопировался
  })

  it('удаление переключает на соседний, а последний проект не исчезает', () => {
    projects.init()
    cfg.insertRectangle(4000, 3000)
    const first = projects.currentId
    projects.create('Второй')
    cfg.insertRectangle(2000, 1000)

    projects.remove(projects.currentId)
    expect(projects.list).toHaveLength(1)
    expect(projects.currentId).toBe(first)
    expect(cfg.area / 1e6).toBeCloseTo(12, 3)

    projects.remove(first)
    expect(projects.list).toHaveLength(1) // завели чистый вместо удалённого
    expect(projects.current?.name).toBe('Проект 1')
    expect(localStorage.getItem(`nmr.project.${first}`)).toBeNull()
  })

  it('переключение проекта не выдаёт себя за правку', () => {
    projects.init()
    const a = projects.currentId
    cfg.insertRectangle(4000, 3000)
    projects.touch()
    const b = projects.create('Второй')

    const dateA = projects.list.find((p) => p.id === a)!.updatedAt
    const dateB = projects.list.find((p) => p.id === b)!.updatedAt

    projects.open(a) // просто посмотрели
    expect(projects.list.find((p) => p.id === a)!.updatedAt).toBe(dateA)
    projects.open(b)
    expect(projects.list.find((p) => p.id === b)!.updatedAt).toBe(dateB)

    // перезапуск приложения тоже не правка
    reload()
    expect(projects.list.find((p) => p.id === a)!.updatedAt).toBe(dateA)
  })

  it('карточка помнит площадь и клиента после открытия', () => {
    projects.init()
    const a = projects.currentId
    cfg.insertRectangle(4000, 3000)
    cfg.order.client = 'Иванов'
    projects.touch()
    projects.create('Второй')
    projects.open(a)
    const meta = projects.list.find((p) => p.id === a)!
    expect(meta.areaM2).toBeCloseTo(12, 3)
    expect(meta.client).toBe('Иванов')
  })

  it('список отсортирован по последнему изменению', async () => {
    projects.init()
    const a = projects.currentId
    projects.rename(a, 'Первый')
    const b = projects.create('Второй')
    projects.open(a)
    projects.touch()
    expect(projects.ordered[0].id).toBe(a)
    expect(projects.ordered[1].id).toBe(b)
  })
})

describe('чертёж по ссылке', () => {
  it('ложится в новый проект, а свой остаётся нетронутым', async () => {
    const cfg = useConfigurator()
    projects.init()

    // свой чертёж: прямоугольник 4×3
    cfg.insertRectangle(4000, 3000)
    const mine = projects.currentId
    const myArea = cfg.totals.areaM2

    // пришла ссылка с другим чертежом
    const shared = JSON.parse(cfg.serialize())
    shared.shapes[0].points = [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 1000, y: 0 },
      { id: 'c', x: 1000, y: 1000 }, { id: 'd', x: 0, y: 1000 },
    ]
    const id = projects.importShared(shared)

    expect(id).not.toBe(mine)
    expect(projects.currentId).toBe(id)
    expect(projects.list.map((p) => p.id)).toContain(mine) // свой на месте
    expect(cfg.totals.areaM2).toBeCloseTo(1, 3) // открыт присланный

    // возвращаемся к своему — он не изменился
    projects.open(mine)
    expect(cfg.totals.areaM2).toBeCloseTo(myArea, 3)
  })

  it('второй присланный чертёж не перетирает первый', () => {
    const cfg = useConfigurator()
    projects.init()
    const model = JSON.parse(cfg.serialize())

    const first = projects.importShared(model)
    const second = projects.importShared(model)
    expect(second).not.toBe(first)
    expect(projects.list.filter((p) => p.name.startsWith('Из ссылки'))).toHaveLength(2)
  })
})
