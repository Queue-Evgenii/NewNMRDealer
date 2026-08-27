<script setup lang="ts">
// Список проектов: каждый проект — отдельный чертёж со своим сохранением.
import { ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjects } from '../stores/projects'
import { shortWhen } from '../composables/useWhen'
import ConfirmDialog from './ConfirmDialog.vue'
import { IconProjectNew, IconRename, IconCopy, IconDelete } from '../icons'

defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ (e: 'pick'): void }>()

const projects = useProjects()
const { ordered, currentId } = storeToRefs(projects)

const editingId = ref('')
const editName = ref('')
// ref внутри v-for Vue собирает в МАССИВ, даже если строка редактируется одна
const nameInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

async function startRename(id: string, name: string) {
  editingId.value = id
  editName.value = name
  await nextTick()
  const el = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value
  el?.focus()
  el?.select()
}
function commitRename() {
  if (editingId.value) projects.rename(editingId.value, editName.value)
  editingId.value = ''
}

function pick(id: string) {
  projects.open(id)
  emit('pick')
}
function addProject() {
  projects.create()
  emit('pick')
}
// удаление подтверждаем своим окном, а не системным confirm()
const pendingDelete = ref<{ id: string; name: string } | null>(null)
function confirmDelete() {
  if (pendingDelete.value) projects.remove(pendingDelete.value.id)
  pendingDelete.value = null
}
</script>

<template>
  <div :class="['projects', { compact }]">
    <div class="head">
      <h3>Проекты</h3>
      <button class="add" title="Новый проект" @click="addProject">
        <IconProjectNew :size="16" :stroke-width="1.75" />
      </button>
    </div>

    <ul class="list">
      <li v-for="p in ordered" :key="p.id" :class="{ on: p.id === currentId }" @click="pick(p.id)">
        <template v-if="editingId === p.id">
          <input ref="nameInput" v-model="editName" class="rename" @click.stop
            @keydown.enter="commitRename" @keydown.esc="editingId = ''" @blur="commitRename" />
        </template>
        <template v-else>
          <div class="row">
            <span class="name">{{ p.name }}</span>
            <span class="when">{{ shortWhen(p.updatedAt) }}</span>
          </div>
          <div class="row sub">
            <span class="muted">{{ p.areaM2 ? p.areaM2.toFixed(2) + ' м²' : 'пусто' }}</span>
            <span v-if="p.client" class="muted client">{{ p.client }}</span>
            <div class="acts">
              <button title="Переименовать" @click.stop="startRename(p.id, p.name)">
                <IconRename :size="14" :stroke-width="1.75" />
              </button>
              <button title="Дубликат" @click.stop="projects.duplicate(p.id)">
                <IconCopy :size="14" :stroke-width="1.75" />
              </button>
              <button class="danger" title="Удалить проект" @click.stop="pendingDelete = { id: p.id, name: p.name }">
                <IconDelete :size="14" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </template>
      </li>
    </ul>

    <ConfirmDialog v-if="pendingDelete"
      title="Удалить проект?"
      :message="`Проект «${pendingDelete.name}» и его чертёж будут удалены без возможности вернуть.`"
      confirm-text="Удалить" @confirm="confirmDelete" @cancel="pendingDelete = null" />
  </div>
</template>

<style scoped>
.projects {
  width: 220px; flex: 0 0 220px; display: flex; flex-direction: column;
  background: #0d1320; border-right: 1px solid #223; overflow: hidden;
}
.projects.compact { width: 100%; flex: 1 1 auto; border-right: none; }

.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #1b2740; }
.head h3 { flex: 1; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa3c4; }
.add {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
  background: #16233f; border: 1px solid #2f6fed; color: #9fc0ff;
}
.add:hover { background: #1d2f52; }

.list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 6px; }
.list li {
  padding: 8px 10px; margin-bottom: 3px;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent;
}
.list li:hover { background: #141d31; }
.list li.on { background: #16274a; border-color: #2f6fed; }

.row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.row.sub { align-items: center; margin-top: 3px; min-height: 24px; }
.name { flex: 1; min-width: 0; font-size: 13px; color: #dbe6ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { font-size: 11px; color: #55637f; flex: 0 0 auto; }
.muted { font-size: 11px; color: #7f90b0; }
.client { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.acts { display: flex; gap: 2px; margin-left: auto; flex: 0 0 auto; visibility: hidden; }
.list li:hover .acts, .list li.on .acts { visibility: visible; }
.acts button {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
  background: rgba(13, 19, 32, 0.9); border: 1px solid #2a3550; color: #8fa3c4;
}
.acts button:hover { background: #24314b; color: #dbe6ff; }
.acts button.danger:hover { background: #3a1b22; border-color: #5a2530; color: #ff9b9b; }

.rename {
  width: 100%; padding: 5px 7px; border-radius: 6px; font-size: 13px;
  background: #0d1320; border: 1px solid #2f6fed; color: #e8eefc;
}

/* на телефоне действия всегда видны — наведения нет */
@media (pointer: coarse) {
  .acts { visibility: visible; }
  .acts button { width: 30px; height: 30px; }
}
</style>
