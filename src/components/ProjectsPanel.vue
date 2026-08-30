<script setup lang="ts">
// Список проектов: каждый проект — отдельный чертёж со своим сохранением.
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useProjects } from '../stores/projects'
import { shortWhen } from '../composables/useWhen'
import ConfirmDialog from './ConfirmDialog.vue'
import { IconProjectNew, IconRename, IconCopy, IconDelete, IconSettings } from '../icons'

defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ (e: 'pick'): void; (e: 'settings'): void }>()

const { t } = useI18n()
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
      <h3>{{ t('projects.title') }}</h3>
      <button class="add" :title="t('projects.add')" @click="addProject">
        <IconProjectNew :size="16" :stroke-width="1.75" />
      </button>
      <button class="add" data-tour="settings" :title="t('projects.settings')" @click="emit('settings')">
        <IconSettings :size="16" :stroke-width="1.75" />
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
            <span class="muted">{{ p.areaM2 ? p.areaM2.toFixed(2) + ' ' + t('common.m2') : t('common.empty') }}</span>
            <span v-if="p.client" class="muted client">{{ p.client }}</span>
            <div class="acts">
              <button :title="t('projects.rename')" @click.stop="startRename(p.id, p.name)">
                <IconRename :size="14" :stroke-width="1.75" />
              </button>
              <button :title="t('projects.duplicate')" @click.stop="projects.duplicate(p.id)">
                <IconCopy :size="14" :stroke-width="1.75" />
              </button>
              <button class="danger" :title="t('projects.remove')" @click.stop="pendingDelete = { id: p.id, name: p.name }">
                <IconDelete :size="14" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </template>
      </li>
    </ul>

    <ConfirmDialog v-if="pendingDelete"
      :title="t('projects.removeTitle')"
      :message="t('projects.removeMessage', { name: pendingDelete.name })" @confirm="confirmDelete" @cancel="pendingDelete = null" />
  </div>
</template>

<style scoped>
.projects {
  width: 220px; flex: 0 0 220px; display: flex; flex-direction: column;
  background: var(--field); border-right: 1px solid var(--border-soft); overflow: hidden;
}
.projects.compact { width: 100%; flex: 1 1 auto; border-right: none; }

.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-soft); }
.head h3 { flex: 1; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.add {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
  background: var(--accent-soft); border: 1px solid var(--accent); color: var(--accent-2);
}
.add:hover { background: var(--accent-soft); }

.list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 6px; }
.list li {
  padding: 8px 10px; margin-bottom: 3px;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent;
}
.list li:hover { background: var(--row); }
.list li.on { background: var(--row-sel); border-color: var(--accent); }

.row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.row.sub { align-items: center; margin-top: 3px; min-height: 24px; }
.name { flex: 1; min-width: 0; font-size: 13px; color: var(--text-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { font-size: 11px; color: var(--muted-3); flex: 0 0 auto; }
.muted { font-size: 11px; color: var(--muted-2); }
.client { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.acts { display: flex; gap: 2px; margin-left: auto; flex: 0 0 auto; visibility: hidden; }
.list li:hover .acts, .list li.on .acts { visibility: visible; }
.acts button {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
  background: rgba(13, 19, 32, 0.9); border: 1px solid var(--border); color: var(--muted);
}
.acts button:hover { background: var(--btn-hover); color: var(--text-accent); }
.acts button.danger:hover { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text); }

.rename {
  width: 100%; padding: 5px 7px; border-radius: 6px; font-size: 13px;
  background: var(--field); border: 1px solid var(--accent); color: var(--text-strong);
}

/* на телефоне действия всегда видны — наведения нет */
@media (pointer: coarse) {
  .acts { visibility: visible; }
  .acts button { width: 30px; height: 30px; }
}
</style>
