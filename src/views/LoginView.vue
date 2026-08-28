<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { IconLogo } from '../icons'

const auth = useAuth()
const router = useRouter()
const login = ref('test')
const pass = ref('test')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  const ok = await auth.login(login.value, pass.value)
  busy.value = false
  if (ok) router.push({ name: 'dashboard' })
  else error.value = 'Неверный логин или пароль'
}
</script>

<template>
  <div class="login">
    <form class="card" @submit.prevent="submit">
      <div class="logo"><IconLogo :size="22" :stroke-width="1.75" /> NMR</div>
      <h1>Вход в систему</h1>
      <p class="sub">Конфигуратор натяжных потолков</p>
      <label>Логин<input v-model="login" autocomplete="username" /></label>
      <label>Пароль<input v-model="pass" type="password" autocomplete="current-password" /></label>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="primary" :disabled="busy">{{ busy ? 'Вход…' : 'Войти' }}</button>
      <p class="hint">Демо-доступ: <b>test / test</b> или <b>Vipcasa</b></p>
    </form>
  </div>
</template>

<style scoped>
.login { display: flex; align-items: center; justify-content: center; height: 100vh; height: 100dvh; background: radial-gradient(1200px 600px at 50% -10%, var(--accent-soft), var(--bg-deep)); }
.card { width: 360px; max-width: 92vw; background: #121a2c; border: 1px solid var(--border-strong); border-radius: 16px; padding: 30px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 24px 70px rgba(0,0,0,.5); }
.logo { font-size: 22px; font-weight: 700; color: var(--accent); }
h1 { margin: 6px 0 0; font-size: 20px; }
.sub { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
input { background: var(--field); border: 1px solid var(--border); color: var(--text-strong); border-radius: 8px; padding: 10px 12px; font-size: 15px; }
.err { color: var(--danger-text); font-size: 13px; margin: 0; }
.primary { margin-top: 6px; padding: 11px; border-radius: 9px; background: var(--accent); border: none; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.primary:disabled { opacity: .6; }
.hint { text-align: center; font-size: 12px; color: var(--muted-2); margin: 2px 0 0; }
</style>
