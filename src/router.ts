import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const routes = [
  // --- base app: pure configurator (public, no chrome) ---------------------
  { path: '/', name: 'configurator', component: () => import('./views/ConstructorView.vue'), meta: { public: true, bare: true } },

  // --- hidden full application under /app (auth-guarded, with shell) --------
  { path: '/app', redirect: { name: 'dashboard' } },
  { path: '/app/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/app/dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
  { path: '/app/orders', name: 'orders', component: () => import('./views/OrdersView.vue') },
  { path: '/app/orders/:id', name: 'order', component: () => import('./views/OrderCardView.vue') },
  { path: '/app/constructor', name: 'app-constructor', component: () => import('./views/ConstructorView.vue') },
  { path: '/app/clients', name: 'clients', component: () => import('./views/ClientsView.vue') },
  { path: '/app/films', name: 'films', component: () => import('./views/FilmsView.vue') },
  { path: '/app/colors', name: 'colors', component: () => import('./views/ColorsView.vue') },
  { path: '/app/warehouse', name: 'warehouse', component: () => import('./views/WarehouseView.vue') },
  { path: '/app/users', name: 'users', component: () => import('./views/UsersView.vue') },
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
