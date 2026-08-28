<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useConfigurator } from '../stores/configurator'
import { themeMode } from '../theme'

const store = useConfigurator()
const { shapesView, settings, order } = storeToRefs(store)

/**
 * Блеск по типу плёнки. Полотно непрозрачное: прозрачный глянец пропускал
 * тёмный фон сцены, и цвет выглядел грязнее, чем выбран.
 */
function filmFinish(film: string) {
  if (film === 'Мат') return { metalness: 0.0, roughness: 0.95 }
  if (film === 'Сатин') return { metalness: 0.08, roughness: 0.55 }
  if (film === 'Фактура') return { metalness: 0.05, roughness: 0.7 }
  return { metalness: 0.25, roughness: 0.15 } // Глянец
}

const host = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let group: THREE.Group | null = null
let raf = 0
/** Габариты, под которые уже наведена камера. */
let framedBounds = ''
let ro: ResizeObserver | null = null

const THICK = 40 // mm — толщина полотна на виде
/**
 * Условная высота помещения. Нужна, чтобы потолок читался потолком: сетка
 * лежит на полу, а полотно висит над ней. Раньше сетка совпадала с плоскостью
 * полотна, и сцена выглядела как «пол в клеточку».
 */
const ROOM_H = 2700

/** Фон сцены = фон холста из темы: 3D не должно светиться чужим цветом. */
function sceneColor(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim()
  return v || '#0f1420'
}

function disposeGroup() {
  if (!group) return
  group.traverse((o) => {
    const any = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material }
    any.geometry?.dispose()
    any.material?.dispose()
  })
  scene.remove(group)
  group = null
}

function buildGeometry() {
  disposeGroup()

  // вырезы отдельными телами не строим — они дырки в полотне яруса;
  // спрятанные ярусы не строим вовсе
  const closedShapes = shapesView.value.filter(
    (s) => s.visible && s.kind === 'ceiling' && s.closed && s.outline.length >= 3,
  )
  if (!closedShapes.length) return

  /*
   * Центр сцены — середина габаритов, а не среднее по вершинам: у скруглённой
   * стороны точек в разы больше, чем у прямой, и среднее утаскивало потолок
   * в сторону от центра сетки.
   */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const s of closedShapes) {
    for (const p of s.outline) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  group = new THREE.Group()

  for (const s of closedShapes) {
    const shape = new THREE.Shape()
    s.outline.forEach((p, i) => {
      const x = p.x - cx
      const y = -(p.y - cy)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()

    // колонны, короба и проёмы под нижний ярус — настоящие дырки в полотне
    for (const hole of s.holes) {
      if (hole.length < 3) continue
      const path = new THREE.Path()
      hole.forEach((p, i) => {
        const x = p.x - cx
        const y = -(p.y - cy)
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      })
      path.closePath()
      shape.holes.push(path)
    }

    const geom = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false })
    geom.rotateX(-Math.PI / 2)
    // ярус опущен вниз; совпадающие полотна разводим на волос, иначе мерцают
    geom.translate(0, -s.drop - closedShapes.indexOf(s) * 0.4, 0)

    // у каждого полотна своя плёнка: блеск и прозрачность берём с него
    const finish = filmFinish(s.film)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(s.colorHex),
      metalness: finish.metalness,
      roughness: finish.roughness,
      side: THREE.DoubleSide,
    })
    group.add(new THREE.Mesh(geom, mat))
    // контуром подсвечиваем только активную фигуру — остальное обводим тускло
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geom, 20),
      new THREE.LineBasicMaterial({ color: s.active ? 0xffd54a : 0x3d4b6b }),
    ))
  }

  // стены и пол: без них полотно висит в пустоте и высоту не прочитать
  const wallPts: number[] = []
  const floorPts: number[] = []
  for (const s of closedShapes) {
    if (s.level !== 1) continue
    const ring = s.points
    for (let i = 0; i < ring.length; i++) {
      const x = ring[i].x - cx
      const z = ring[i].y - cy
      const nx = ring[(i + 1) % ring.length].x - cx
      const nz = ring[(i + 1) % ring.length].y - cy
      wallPts.push(x, 0, z, x, -ROOM_H, z)          // стойка от потолка до пола
      floorPts.push(x, -ROOM_H, z, nx, -ROOM_H, nz) // контур по полу
    }
  }
  if (wallPts.length) {
    const g1 = new THREE.BufferGeometry()
    g1.setAttribute('position', new THREE.Float32BufferAttribute(wallPts, 3))
    group.add(new THREE.LineSegments(g1, new THREE.LineBasicMaterial({ color: 0x2a3550 })))
    const g2 = new THREE.BufferGeometry()
    g2.setAttribute('position', new THREE.Float32BufferAttribute(floorPts, 3))
    group.add(new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0x35456b })))
  }

  scene.add(group)
  // камеру наводим только когда изменились сами габариты: смена цвета или
  // плёнки не должна сбивать поворот, который зритель только что выставил
  const bounds = [minX, maxX, minY, maxY].map(Math.round).join(':')
  if (bounds !== framedBounds) {
    framedBounds = bounds
    frameCamera()
  }
}

function frameCamera() {
  if (!group) return
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.z, size.y) || 1000
  // расстояние считаем от угла обзора, и на узком экране (телефон стоймя)
  // отодвигаем камеру — иначе кадр режет потолок по бокам
  const fov = (camera.fov * Math.PI) / 180
  const dist = (radius / Math.tan(fov / 2)) * (camera.aspect < 1 ? 1 / camera.aspect : 1)
  controls.target.copy(centre)
  camera.position.copy(centre).addScaledVector(new THREE.Vector3(0.9, 1.2, 1.4).normalize(), dist)
  camera.near = radius / 100
  camera.far = dist * 20
  camera.updateProjectionMatrix()
  controls.update()
}

function resize() {
  if (!host.value) return
  const { clientWidth: w, clientHeight: h } = host.value
  if (!w || !h) return
  /*
   * Размер задаём вместе со стилем холста. Без него при devicePixelRatio > 1
   * холст получал css-размер буфера — вдвое больше блока, — и видимой
   * оставалась левая верхняя четверть кадра: сцена выглядела смещённой.
   */
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(sceneColor())

  camera = new THREE.PerspectiveCamera(45, 1, 1, 100000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  host.value!.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  // потолок смотрят снизу, поэтому низ освещён не хуже верха: раньше нижняя
  // сторона уходила в цвет «земли» полусферы и полотно выглядело затемнённым
  scene.add(new THREE.HemisphereLight(0xeaf1ff, 0xaab6cc, 0.85))
  const dir = new THREE.DirectionalLight(0xffffff, 0.75)
  dir.position.set(1, 2, 1.5)
  scene.add(dir)
  const under = new THREE.DirectionalLight(0xffffff, 0.55)
  under.position.set(-0.6, -1.6, 0.8)
  scene.add(under)

  // сетка — это пол, поэтому она внизу, а не в плоскости полотна
  const grid = new THREE.GridHelper(30000, 60, 0x243049, 0x1a2338)
  grid.position.y = -ROOM_H
  scene.add(grid)

  // размер сначала: камера наводится с учётом пропорций окна
  resize()
  buildGeometry()

  ro = new ResizeObserver(resize)
  ro.observe(host.value!)

  const loop = () => {
    controls.update()
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  loop()
})

watch([shapesView, settings, order], buildGeometry, { deep: true })
watch(themeMode, () => { if (scene) scene.background = new THREE.Color(sceneColor()) })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  disposeGroup()
  controls.dispose()
  renderer.dispose()
  renderer.domElement.remove()
})
</script>

<template>
  <div ref="host" class="view3d"></div>
</template>

<style scoped>
.view3d {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
/* холст создаёт three, поэтому размер ему задаём отсюда — на всякий случай */
.view3d :deep(canvas) { display: block; width: 100%; height: 100%; }
</style>
