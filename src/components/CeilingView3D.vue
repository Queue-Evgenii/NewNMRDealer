<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useConfigurator } from '../stores/configurator'

const store = useConfigurator()
const { points, closed, settings } = storeToRefs(store)

const host = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let mesh: THREE.Mesh | null = null
let edgeLines: THREE.LineSegments | null = null
let raf = 0
let ro: ResizeObserver | null = null

const THICK = 40 // mm — visual slab thickness

function buildGeometry() {
  if (mesh) {
    scene.remove(mesh)
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
    mesh = null
  }
  if (edgeLines) {
    scene.remove(edgeLines)
    edgeLines.geometry.dispose()
    edgeLines = null
  }
  if (!closed.value || points.value.length < 3) return

  // centre the shape around origin so the camera framing is stable
  let cx = 0, cy = 0
  for (const p of points.value) { cx += p.x; cy += p.y }
  cx /= points.value.length
  cy /= points.value.length

  const shape = new THREE.Shape()
  points.value.forEach((p, i) => {
    const x = p.x - cx
    const y = -(p.y - cy) // flip Y so screen-down maps to world-up view
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: THICK,
    bevelEnabled: false,
  })
  geom.rotateX(-Math.PI / 2) // lay flat like a ceiling

  const mat = new THREE.MeshStandardMaterial({
    color: 0x5aa0ff,
    metalness: 0.15,
    roughness: 0.35,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  })
  mesh = new THREE.Mesh(geom, mat)
  scene.add(mesh)

  const edges = new THREE.EdgesGeometry(geom, 20)
  edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffd54a }),
  )
  scene.add(edgeLines)

  frameCamera()
}

function frameCamera() {
  if (!mesh) return
  const box = new THREE.Box3().setFromObject(mesh)
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

watch([points, closed, settings], buildGeometry, { deep: true })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
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
