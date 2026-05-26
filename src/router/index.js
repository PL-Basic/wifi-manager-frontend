import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import DashboardView from '@/views/DashboardView.vue'
import ProfileView from '@/views/ProfileView.vue'
import { clearSession, getStoredRole, isTokenExpired } from '@/utils/session'

const routes = [
  { path: '/', redirect: () => (getStoredRole() <= 1 ? '/dashboard' : '/profile') },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true, adminOnly: true } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = sessionStorage.getItem('token')
  const role = getStoredRole()
  if (token && isTokenExpired()) {
    clearSession('登录状态已过期，请重新登录')
    return '/login'
  }
  if (to.meta.requiresAuth && !token) {
    return '/login'
  }
  if (to.meta.adminOnly && role > 1) {
    return '/profile'
  }
  if ((to.path === '/login' || to.path === '/register') && token) {
    return role <= 1 ? '/dashboard' : '/profile'
  }
  return true
})

export default router
