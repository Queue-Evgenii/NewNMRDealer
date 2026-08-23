import { defineStore } from 'pinia'
import { api } from '../api'
import type { User } from '../api/types'

export const useAuth = defineStore('auth', {
  state: () => ({ user: null as User | null }),
  getters: {
    isAuthed: (s) => s.user !== null,
  },
  actions: {
    async login(login: string, pass: string): Promise<boolean> {
      const u = await api.login(login, pass)
      this.user = u
      try { if (u) localStorage.setItem('nmr.user', JSON.stringify(u)) } catch { /* ignore */ }
      return u !== null
    },
    restore() {
      try {
        const raw = localStorage.getItem('nmr.user')
        if (raw) this.user = JSON.parse(raw)
      } catch { /* ignore */ }
    },
    logout() {
      this.user = null
      try { localStorage.removeItem('nmr.user') } catch { /* ignore */ }
    },
  },
})
