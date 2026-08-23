<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useConfigurator } from '../stores/configurator'
import { filmColor } from '../filmColors'

const store = useConfigurator()
const { shapesView, settings, order } = storeToRefs(store)

// material finish per film type
function filmFinish(film: string) {
  if (film === 'Мат') return { metalness: 0.0, roughness: 0.95, opacity: 1 }
  if (film === 'Сатин') return { metalness: 0.1, roughness: 0.55, opacity: 0.95 }
  if (film === 'Фактура') return { metalness: 0.05, roughness: 0.7, opacity: 1 }
  return { metalness: 0.35, roughness: 0.12, opacity: 0.9 } // Глянец
}

const host = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let group: THREE.Group | null = null
let raf = 0
let ro: ResizeObserver | null = null

const THICK = 40 // mm — visual slab thickness

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

  const closedShapes = shapesView.value.filter((s) => s.closed && s.points.length >= 3)
  if (!closedShapes.length) return

  // centre all shapes around a common origin (stable camera framing)
  let cx = 0, cy = 0, count = 0
  for (const s of closedShapes) for (const p of s.points) { cx += p.x; cy += p.y; count++ }
  cx /= count || 1; cy /= count || 1

  const finish = filmFinish(order.value.film)
  group = new THREE.Group()

  for (const s of closedShapes) {
    const shape = new THREE.Shape()
    s.points.forEach((p, i) => {
      const x = p.x - cx
      const y = -(p.y - cy)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()

    const geom = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false })
    geom.rotateX(-Math.PI / 2)

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(filmColor(order.value.film)),
      metalness: finish.metalness,
      roughness: finish.roughness,
      transparent: finish.opacity < 1,
      opacity: finish.opacity,
      side: THREE.DoubleSide,
    })
    group.add(new THREE.Mesh(geom, mat))
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 20), new THREE.LineBasicMaterial({ color: 0xffd54a })))
  }

  scene.add(group)
  frameCamera()
}

function frameCamera() {
  if (!group) return
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.z, size.y) || 1000
  controls.target.copy(centre)
  camera.position.set(centre.x + radius * 0.9, centre.y + radius * 1.2, centre.z + radius * 1.4)
  camera.near = radius / 100
  camera.far = radius * 20
  camera.updateProjectionMatrix()
  controls.update()
}

function resize() {
  if (!host.value) return
  const { clientWidth: w, clientHeight: h } = host.value
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0f1420)

  camera = new THREE.PerspectiveCamera(45, 1, 1, 100000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  host.value!.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(1, 2, 1.5)
  scene.add(dir)

  const grid = new THREE.GridHelper(20000, 40, 0x2a3550, 0x1e2740)
  scene.add(grid)

  buildGeometry()
  resize()

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
</style>
