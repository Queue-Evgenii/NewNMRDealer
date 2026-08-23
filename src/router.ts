import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
  { path: '/orders', name: 'orders', component: () => import('./views/OrdersView.vue') },
  { path: '/orders/:id', name: 'order', component: () => import('./views/OrderCardView.vue') },
  { path: '/constructor', name: 'constructor', component: () => import('./views/ConstructorView.vue') },
  { path: '/clients', name: 'clients', component: () => import('./views/ClientsView.vue') },
  { path: '/films', name: 'films', component: () => import('./views/FilmsView.vue') },
  { path: '/colors', name: 'colors', component: () => import('./views/ColorsView.vue') },
  { path: '/warehouse', name: 'warehouse', component: () => import('./views/WarehouseView.vue') },
  { path: '/users', name: 'users', component: () => import('./views/UsersView.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (!auth.isAuthed) auth.restore()
  if (!to.meta.public && !auth.isAuthed) return { name: 'login' }
  if (to.name === 'login' && auth.isAuthed) return { name: 'dashboard' }
  return true
})
