import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigurator } from '../src/stores/configurator'
import {
  wallsToPoints, closingLength, wizardAreaM2, selfIntersects, contourProblem, cornerName, defaultWalls,
  type WallSpec,
} from '../src/composables/useWizard'

let store: ReturnType<typeof useConfigurator>
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  store = useConfigurator()
})

const wall = (length: number, turn = 90, name = ''): WallSpec => ({ length, turn, name })

/**
 * Мастер строит контур так же, как комнату обходят с рулеткой: стена — поворот
 * — стена. Последняя стена замыкает контур сама.
 */
describe('мастер контура', () => {
  it('четыре стены с поворотом направо дают прямоугольник', () => {
    const pts = wallsToPoints([wall(3000), wall(2000), wall(3000), wall(2000)])
    expect(pts).toHaveLength(4)
    expect(pts[0]).toMatchObject({ x: 0, y: 0 })
    expect(pts[1]).toMatchObject({ x: 3000, y: 0 })
    expect(pts[2]).toMatchObject({ x: 3000, y: 2000 })
    expect(pts[3]).toMatchObject({ x: 0, y: 2000 })
    expect(wizardAreaM2(pts)).toBeCloseTo(6, 3)
  })

  it('последнюю стену считает сам, а не просит ввести', () => {
    // введены только три стены, четвёртая замыкающая
    const pts = wallsToPoints([wall(4000), wall(2500), wall(4000), wall(999999)])
    expect(closingLength(pts)).toBe(2500) // длина замыкающей, а не то, что «ввели»
    expect(wizardAreaM2(pts)).toBeCloseTo(10, 3)
  })

  it('поворот налево делает вогнутый угол — Г-образная комната', () => {
    const pts = wallsToPoints([
      wall(4000), wall(1500), wall(2000, -90), wall(1500), wall(2000), wall(3000),
    ])
    expect(pts).toHaveLength(6)
    expect(selfIntersects(pts)).toBe(false)
    expect(wizardAreaM2(pts)).toBeGreaterThan(0)
  })

  it('замечает контур, который сам себя пересекает', () => {
    // «бабочка»: замыкающая сторона пересекает противоположную
    const bow = [
      { x: 0, y: 0, name: 'А' }, { x: 3000, y: 0, name: 'Б' },
      { x: 0, y: 2000, name: 'В' }, { x: 3000, y: 2000, name: 'Г' },
    ]
    expect(selfIntersects(bow)).toBe(true)
    expect(selfIntersects(wallsToPoints(defaultWalls(4)))).toBe(false)
  })

  it('углы по умолчанию получают буквы, введённое имя сохраняется', () => {
    expect(cornerName(0)).toBe('А')
    expect(cornerName(2)).toBe('В')
    const pts = wallsToPoints([wall(1000, 90, 'у окна'), wall(1000), wall(1000), wall(1000)])
    expect(pts[0].name).toBe('у окна')
    expect(pts[1].name).toBe('Б')
  })

  it('заготовка по числу углов всегда даёт замкнутый контур', () => {
    for (const n of [3, 4, 6, 8, 12]) {
      const pts = wallsToPoints(defaultWalls(n))
      expect(pts, `углов: ${n}`).toHaveLength(n)
      expect(closingLength(pts)).toBeGreaterThan(0)
    }
  })
})

describe('контур из мастера в конструкторе', () => {
  it('строится с именами углов и правильной площадью', () => {
    store.insertFromWalls([
      wall(4000, 90, 'А'), wall(3000, 90, 'Б'), wall(4000, 90, 'В'), wall(3000, 90, 'Г'),
    ])
    expect(store.shapes).toHaveLength(1)
    expect(store.activeShape.points).toHaveLength(4)
    expect(store.activeShape.closed).toBe(true)
    expect(store.area / 1e6).toBeCloseTo(12, 3)
    expect(store.activeShape.points.map((p) => p.name)).toEqual(['А', 'Б', 'В', 'Г'])
  })

  it('имена углов попадают в лист замера', () => {
    store.insertFromWalls([
      wall(4000, 90, 'А'), wall(3000, 90, 'Б'), wall(4000, 90, 'В'), wall(3000, 90, 'Г'),
    ])
    store.triangulateActive()
    const sides = store.measureRows.map((r) => r.side).join(' ')
    expect(sides).toContain('А')
    expect(sides).toContain('В')
    expect(sides).not.toContain('1–2') // номера заменены именами
  })

  it('контур из мастера дальше живёт как обычный: правится и режется', () => {
    store.insertFromWalls([wall(4000), wall(3000), wall(4000), wall(3000)])
    const e = store.activeEdges[0]
    store.insertOnEdge(e.key)
    expect(store.activeShape.points).toHaveLength(5)
    expect(store.triangulateActive()).toBeNull()
    expect(store.triangleAreaM2).toBeCloseTo(store.activeChordAreaM2, 2)
  })
})

/**
 * Обход можно задать так, что контур сложится сам на себя. Внешне это почти
 * незаметно — просто одна буква угла прячется под другой, — поэтому мастер
 * обязан ловить такое и называть причину.
 */
describe('мастер ловит сложившийся обход', () => {
  it('замечает, что два угла попали в одну точку', () => {
    const pts = wallsToPoints([
      wall(1000), wall(3000), wall(2000), wall(3000),
      wall(2000), wall(1000, -90), wall(1000), wall(1500),
    ])
    const dup = pts.filter((p, i) => pts.some((q, j) => j > i && q.x === p.x && q.y === p.y))
    expect(dup.length, 'такой обход действительно складывается').toBeGreaterThan(0)

    const problem = contourProblem(pts)
    expect(problem, 'мастер обязан это заметить').not.toBeNull()
    expect(problem).toMatch(/одну точку/)
    // этот обход ловится и по пересечению, но сообщение теперь называет причину
    expect(selfIntersects(pts)).toBe(true)
  })

  it('не даёт построить такой контур', () => {
    const err = store.insertFromWalls([
      wall(1000), wall(3000), wall(2000), wall(3000),
      wall(2000), wall(1000, -90), wall(1000), wall(1500),
    ])
    expect(err).not.toBeNull()
    expect(store.shapes[0].points.length, 'чертёж не тронут').toBe(4) // остался стартовый прямоугольник
  })

  it('исправный обход проходит без замечаний', () => {
    expect(contourProblem(wallsToPoints(defaultWalls(4)))).toBeNull()
    expect(contourProblem(wallsToPoints([
      wall(4000), wall(1500), wall(2000, -90), wall(1500), wall(2000), wall(3000),
    ]))).toBeNull()
    expect(store.insertFromWalls(defaultWalls(4))).toBeNull()
  })

  it('замечает стену, налегающую на угол', () => {
    // «шпилька»: пошли вперёд и вернулись по той же линии
    const spike = [
      { x: 0, y: 0, name: 'А' }, { x: 3000, y: 0, name: 'Б' },
      { x: 1500, y: 0, name: 'В' }, { x: 1500, y: 2000, name: 'Г' },
    ]
    expect(contourProblem(spike)).toMatch(/налегают/)
  })
})

/**
 * Сплошной перебор: для восьмиугольника есть 128 комбинаций поворотов, и
 * большинство из них складывает контур. Ни одна такая комбинация не должна
 * проходить проверку — иначе мастер снова построит битую фигуру.
 */
describe('перебор обходов', () => {
  it('ни один сложившийся контур не проходит проверку', () => {
    const lens = [1000, 3000, 2000, 3000, 2000, 1000, 1000, 1000]
    let valid = 0
    for (let mask = 0; mask < 128; mask++) {
      const walls = lens.map((l, i) => wall(l, i < 7 ? (((mask >> i) & 1) ? -90 : 90) : 90))
      const pts = wallsToPoints(walls)
      const folded = pts.some((p, i) => pts.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) < 1))
      const problem = contourProblem(pts)
      if (folded) expect(problem, `комбинация ${mask} сложена, но пропущена`).not.toBeNull()
      if (!problem) valid++
    }
    expect(valid, 'исправные обходы тоже должны находиться').toBeGreaterThan(10)
  })
})

/**
 * Заготовка обязана быть рабочей при ЛЮБОМ числе углов. Прежняя повторяла
 * 3000/2000 с поворотом направо, и уже на пяти углах контур складывался —
 * мастер встречал пользователя красной ошибкой сразу после выбора «6».
 */
describe('заготовка стен', () => {
  it('даёт замкнутый исправный контур для 3…16 углов', () => {
    for (let n = 3; n <= 16; n++) {
      const walls = defaultWalls(n)
      expect(walls, `стен для ${n} углов`).toHaveLength(n)
      const pts = wallsToPoints(walls)
      expect(pts, `углов получилось для n=${n}`).toHaveLength(n)
      expect(contourProblem(pts), `заготовка на ${n} углов сломана`).toBeNull()
      expect(wizardAreaM2(pts), `площадь для n=${n}`).toBeGreaterThan(0)
    }
  })

  it('заготовка сразу строится в конструкторе', () => {
    for (const n of [4, 5, 6, 8, 11]) {
      setActivePinia(createPinia())
      const s = useConfigurator()
      expect(s.insertFromWalls(defaultWalls(n)), `n=${n}`).toBeNull()
      expect(s.activeShape.points, `n=${n}`).toHaveLength(n)
    }
  })
})
